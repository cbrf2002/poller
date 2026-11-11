import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { ConvexError, v } from 'convex/values';
import { fingerprint } from '../shared/hash';
import { buildResults } from '../shared/results';
import {
  comparableValue,
  repeatedValueError,
  validateAnswers,
  validateProfile,
} from '../shared/validate';
import { components } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  serverMutation,
  serverQuery,
  splitTallies,
  statsFor,
  talliesFor,
} from './lib';
import { formInput } from './validators';

const limiter = new RateLimiter(components.rateLimiter, {
  // Per hashed IP: generous for a room sharing one Wi-Fi, tight for scripts.
  enter: { kind: 'token bucket', rate: 60, period: MINUTE, capacity: 60 },
});

async function openSet(ctx: QueryCtx, slug: string) {
  const set = await ctx.db
    .query('sets')
    .withIndex('by_slug', q => q.eq('slug', slug))
    .unique();
  if (!set || set.status === 'draft' || !set.live) return null;
  return { ...set, live: set.live };
}

async function findRespondent(
  ctx: QueryCtx,
  setId: Id<'sets'>,
  tokenHash: string
) {
  return ctx.db
    .query('respondents')
    .withIndex('by_setId_and_tokenHash', q =>
      q.eq('setId', setId).eq('tokenHash', tokenHash)
    )
    .unique();
}

async function bumpStats(
  ctx: MutationCtx,
  setId: Id<'sets'>,
  change: 'entered' | 'submitted'
) {
  const stats = await statsFor(ctx, setId);
  if (stats)
    await ctx.db.patch('setStats', stats._id, { [change]: stats[change] + 1 });
  else
    await ctx.db.insert('setStats', {
      setId,
      entered: change === 'entered' ? 1 : 0,
      submitted: change === 'submitted' ? 1 : 0,
    });
}

async function bumpTally(
  ctx: MutationCtx,
  setId: Id<'sets'>,
  questionId: string,
  optionId: string
) {
  const row = await ctx.db
    .query('tallies')
    .withIndex('by_setId_and_questionId_and_optionId', q =>
      q.eq('setId', setId).eq('questionId', questionId).eq('optionId', optionId)
    )
    .unique();
  if (row) await ctx.db.patch('tallies', row._id, { count: row.count + 1 });
  else
    await ctx.db.insert('tallies', { setId, questionId, optionId, count: 1 });
}

/** The live set behind a public link, or null while it's a draft or gone. */
export const publicSet = serverQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const set = await openSet(ctx, slug);
    if (!set) return null;
    return {
      slug: set.slug,
      status: set.status,
      version: fingerprint([set.status, set.live]),
      content: set.live,
    };
  },
});

/** Where a participant is in the flow: not started, entered, or submitted. */
export const progress = serverQuery({
  args: { slug: v.string(), tokenHash: v.string() },
  handler: async (ctx, { slug, tokenHash }) => {
    const set = await openSet(ctx, slug);
    if (!set) return null;
    const respondent = await findRespondent(ctx, set._id, tokenHash);
    if (!respondent) return 'new' as const;
    return respondent.submittedAt === null
      ? ('entered' as const)
      : ('submitted' as const);
  },
});

export const enter = serverMutation({
  args: {
    slug: v.string(),
    tokenHash: v.string(),
    ipKey: v.string(),
    input: formInput,
  },
  handler: async (ctx, { slug, tokenHash, ipKey, input }) => {
    const set = await openSet(ctx, slug);
    if (!set) throw new ConvexError({ kind: 'not_found' });
    if (set.status === 'closed') throw new ConvexError({ kind: 'closed' });
    if (await findRespondent(ctx, set._id, tokenHash)) return null;

    const { values, errors } = validateProfile(set.live.fields, input);
    const comparable: { fieldId: string; value: string }[] = [];
    for (const field of set.live.fields) {
      const value = comparableValue(field, values[field.id] ?? '');
      if (value === null) continue;
      comparable.push({ fieldId: field.id, value });
      if (!field.unique || errors[field.id]) continue;
      const taken = await ctx.db
        .query('detailValues')
        .withIndex('by_setId_and_fieldId_and_value', q =>
          q.eq('setId', set._id).eq('fieldId', field.id).eq('value', value)
        )
        .first();
      if (taken) errors[field.id] = repeatedValueError(field);
    }
    if (Object.keys(errors).length)
      throw new ConvexError({ kind: 'invalid', errors });

    const { ok, retryAfter } = await limiter.limit(ctx, 'enter', {
      key: ipKey,
    });
    if (!ok)
      throw new ConvexError({
        kind: 'rate_limited',
        retryAfter: retryAfter ?? 0,
      });

    const respondentId = await ctx.db.insert('respondents', {
      setId: set._id,
      tokenHash,
      profile: values,
      enteredAt: Date.now(),
      submittedAt: null,
    });
    for (const detail of comparable) {
      await ctx.db.insert('detailValues', {
        setId: set._id,
        respondentId,
        ...detail,
      });
    }
    await bumpStats(ctx, set._id, 'entered');
    return null;
  },
});

export const submit = serverMutation({
  args: { slug: v.string(), tokenHash: v.string(), input: formInput },
  handler: async (ctx, { slug, tokenHash, input }) => {
    const set = await openSet(ctx, slug);
    if (!set) throw new ConvexError({ kind: 'not_found' });
    if (set.status === 'closed') throw new ConvexError({ kind: 'closed' });
    const respondent = await findRespondent(ctx, set._id, tokenHash);
    if (!respondent) throw new ConvexError({ kind: 'not_entered' });
    if (respondent.submittedAt !== null) return null;

    const { answers, errors } = validateAnswers(set.live.questions, input);
    if (Object.keys(errors).length)
      throw new ConvexError({ kind: 'invalid', errors });

    const submittedAt = Date.now();
    await ctx.db.insert('responses', {
      setId: set._id,
      respondentId: respondent._id,
      answers,
      submittedAt,
    });
    await ctx.db.patch('respondents', respondent._id, { submittedAt });
    for (const answer of answers) {
      await bumpTally(ctx, set._id, answer.questionId, '*');
      for (const optionId of answer.optionIds) {
        await bumpTally(ctx, set._id, answer.questionId, optionId);
      }
    }
    await bumpStats(ctx, set._id, 'submitted');
    return null;
  },
});

function ownAnswers(
  response: Doc<'responses'> | null
): Record<string, string[]> {
  const picked: Record<string, string[]> = {};
  for (const answer of response?.answers ?? [])
    picked[answer.questionId] = answer.optionIds;
  return picked;
}

/** Results for someone who has submitted; null for anyone else. */
export const results = serverQuery({
  args: { slug: v.string(), tokenHash: v.string() },
  handler: async (ctx, { slug, tokenHash }) => {
    const set = await openSet(ctx, slug);
    if (!set) return null;
    const respondent = await findRespondent(ctx, set._id, tokenHash);
    if (!respondent || respondent.submittedAt === null) return null;

    const response = await ctx.db
      .query('responses')
      .withIndex('by_respondentId', q => q.eq('respondentId', respondent._id))
      .first();
    const stats = await statsFor(ctx, set._id);
    const { tallies, answeredBy } = splitTallies(
      await talliesFor(ctx, set._id)
    );
    return {
      title: set.live.title,
      status: set.status,
      version: fingerprint([set.status, set.live]),
      submitted: stats?.submitted ?? 0,
      results: buildResults(set.live.questions, tallies, answeredBy),
      mine: ownAnswers(response),
    };
  },
});
