import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { newSlug } from '../shared/ids';
import { buildResults } from '../shared/results';
import { normalizeSetContent, publishProblems } from '../shared/validate';
import { internal } from './_generated/api';
import { internalMutation, type MutationCtx } from './_generated/server';
import {
  adminArgs,
  requireAdmin,
  requireOwnedSet,
  serverMutation,
  serverQuery,
  splitTallies,
  statsFor,
  talliesFor,
} from './lib';
import { setContent, setStatus } from './validators';

async function uniqueSlug(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = newSlug();
    const clash = await ctx.db
      .query('sets')
      .withIndex('by_slug', q => q.eq('slug', slug))
      .first();
    if (!clash) return slug;
  }
  throw new ConvexError({ kind: 'slug_exhausted' });
}

export const list = serverQuery({
  args: adminArgs,
  handler: async (ctx, { session, now }) => {
    const admin = await requireAdmin(ctx, session, now);
    const sets = await ctx.db
      .query('sets')
      .withIndex('by_ownerId_and_updatedAt', q => q.eq('ownerId', admin._id))
      .order('desc')
      .take(200);
    return Promise.all(
      sets.map(async set => {
        const stats = await statsFor(ctx, set._id);
        return {
          id: set._id,
          slug: set.slug,
          status: set.status,
          title: set.content.title,
          questionCount: set.content.questions.length,
          entered: stats?.entered ?? 0,
          submitted: stats?.submitted ?? 0,
          updatedAt: set.updatedAt,
        };
      })
    );
  },
});

export const create = serverMutation({
  args: { ...adminArgs, title: v.string() },
  handler: async (ctx, { session, now, title }) => {
    const admin = await requireAdmin(ctx, session, now);
    const content = normalizeSetContent({ title, fields: [], questions: [] });
    const setId = await ctx.db.insert('sets', {
      ownerId: admin._id,
      slug: await uniqueSlug(ctx),
      status: 'draft',
      content,
      live: null,
      revision: 1,
      updatedAt: Date.now(),
    });
    await ctx.db.insert('setStats', { setId, entered: 0, submitted: 0 });
    return setId;
  },
});

export const get = serverQuery({
  args: { ...adminArgs, setId: v.string() },
  handler: async (ctx, { session, now, setId }) => {
    const admin = await requireAdmin(ctx, session, now);
    const set = await requireOwnedSet(ctx, admin._id, setId);
    const stats = await statsFor(ctx, set._id);
    return {
      id: set._id,
      slug: set.slug,
      status: set.status,
      content: set.content,
      liveMatchesDraft:
        set.live !== null &&
        JSON.stringify(set.live) === JSON.stringify(set.content),
      revision: set.revision,
      updatedAt: set.updatedAt,
      entered: stats?.entered ?? 0,
      submitted: stats?.submitted ?? 0,
    };
  },
});

/**
 * Autosave from the editor. A published or closed set goes live with every
 * save that passes `publishProblems`; otherwise participants keep the last
 * valid version until the draft is fixed.
 */
export const save = serverMutation({
  args: { ...adminArgs, setId: v.string(), content: setContent },
  handler: async (ctx, { session, now, setId, content }) => {
    const admin = await requireAdmin(ctx, session, now);
    const set = await requireOwnedSet(ctx, admin._id, setId);
    const clean = normalizeSetContent(content);
    const problems = publishProblems(clean);
    const goesLive = set.status !== 'draft' && problems.length === 0;
    const revision = set.revision + 1;
    const updatedAt = Date.now();
    await ctx.db.patch('sets', set._id, {
      content: clean,
      ...(goesLive ? { live: clean } : {}),
      revision,
      updatedAt,
    });
    return {
      content: clean,
      revision,
      updatedAt,
      problems,
      live: set.status === 'draft' ? false : goesLive,
    };
  },
});

export const changeStatus = serverMutation({
  args: { ...adminArgs, setId: v.string(), status: setStatus },
  handler: async (ctx, { session, now, setId, status }) => {
    const admin = await requireAdmin(ctx, session, now);
    const set = await requireOwnedSet(ctx, admin._id, setId);
    if (status === 'published') {
      const problems = publishProblems(set.content);
      if (problems.length)
        throw new ConvexError({ kind: 'not_ready', problems });
      await ctx.db.patch('sets', set._id, {
        status,
        live: set.content,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch('sets', set._id, { status, updatedAt: Date.now() });
    }
    return null;
  },
});

export const remove = serverMutation({
  args: { ...adminArgs, setId: v.string() },
  handler: async (ctx, { session, now, setId }) => {
    const admin = await requireAdmin(ctx, session, now);
    const set = await requireOwnedSet(ctx, admin._id, setId);
    await ctx.db.delete('sets', set._id);
    await ctx.scheduler.runAfter(0, internal.sets.purge, { setId: set._id });
    return null;
  },
});

/** Deletes a removed set's rows in batches, rescheduling until done. */
export const purge = internalMutation({
  args: { setId: v.id('sets') },
  handler: async (ctx, { setId }) => {
    const batch = 200;
    const [stats, respondents, responses, tallies, details] = await Promise.all(
      [
        ctx.db
          .query('setStats')
          .withIndex('by_setId', q => q.eq('setId', setId))
          .take(batch),
        ctx.db
          .query('respondents')
          .withIndex('by_setId_and_enteredAt', q => q.eq('setId', setId))
          .take(batch),
        ctx.db
          .query('responses')
          .withIndex('by_setId', q => q.eq('setId', setId))
          .take(batch),
        ctx.db
          .query('tallies')
          .withIndex('by_setId_and_questionId_and_optionId', q =>
            q.eq('setId', setId)
          )
          .take(batch),
        ctx.db
          .query('detailValues')
          .withIndex('by_setId_and_fieldId_and_value', q =>
            q.eq('setId', setId)
          )
          .take(batch),
      ]
    );
    for (const row of stats) await ctx.db.delete('setStats', row._id);
    for (const row of respondents) await ctx.db.delete('respondents', row._id);
    for (const row of responses) await ctx.db.delete('responses', row._id);
    for (const row of tallies) await ctx.db.delete('tallies', row._id);
    for (const row of details) await ctx.db.delete('detailValues', row._id);
    const more = [stats, respondents, responses, tallies, details].some(
      rows => rows.length === batch
    );
    if (more) await ctx.scheduler.runAfter(0, internal.sets.purge, { setId });
    return null;
  },
});

/**
 * Removes one respondent (a test entry, a duplicate): their details, their
 * answers and the votes those answers added. Their browser can join again.
 */
export const removeRespondent = serverMutation({
  args: { ...adminArgs, setId: v.string(), respondentId: v.string() },
  handler: async (ctx, { session, now, setId, respondentId }) => {
    const admin = await requireAdmin(ctx, session, now);
    const set = await requireOwnedSet(ctx, admin._id, setId);
    const id = ctx.db.normalizeId('respondents', respondentId);
    const respondent = id ? await ctx.db.get('respondents', id) : null;
    if (!respondent || respondent.setId !== set._id) {
      throw new ConvexError({ kind: 'not_found' });
    }

    const response = await ctx.db
      .query('responses')
      .withIndex('by_respondentId', q => q.eq('respondentId', respondent._id))
      .first();
    for (const answer of response?.answers ?? []) {
      for (const optionId of ['*', ...answer.optionIds]) {
        const tally = await ctx.db
          .query('tallies')
          .withIndex('by_setId_and_questionId_and_optionId', q =>
            q
              .eq('setId', set._id)
              .eq('questionId', answer.questionId)
              .eq('optionId', optionId)
          )
          .unique();
        if (!tally) continue;
        if (tally.count <= 1) await ctx.db.delete('tallies', tally._id);
        else
          await ctx.db.patch('tallies', tally._id, { count: tally.count - 1 });
      }
    }
    if (response) await ctx.db.delete('responses', response._id);

    const details = await ctx.db
      .query('detailValues')
      .withIndex('by_respondentId', q => q.eq('respondentId', respondent._id))
      .take(50);
    for (const row of details) await ctx.db.delete('detailValues', row._id);

    const stats = await statsFor(ctx, set._id);
    if (stats) {
      await ctx.db.patch('setStats', stats._id, {
        entered: Math.max(0, stats.entered - 1),
        submitted: Math.max(
          0,
          stats.submitted - (respondent.submittedAt === null ? 0 : 1)
        ),
      });
    }
    await ctx.db.delete('respondents', respondent._id);
    return null;
  },
});

export const results = serverQuery({
  args: { ...adminArgs, setId: v.string() },
  handler: async (ctx, { session, now, setId }) => {
    const admin = await requireAdmin(ctx, session, now);
    const set = await requireOwnedSet(ctx, admin._id, setId);
    const stats = await statsFor(ctx, set._id);
    const questions = (set.live ?? set.content).questions;
    const { tallies, answeredBy } = splitTallies(
      await talliesFor(ctx, set._id)
    );
    return {
      id: set._id,
      slug: set.slug,
      status: set.status,
      title: set.content.title,
      fields: (set.live ?? set.content).fields,
      questions,
      entered: stats?.entered ?? 0,
      submitted: stats?.submitted ?? 0,
      results: buildResults(questions, tallies, answeredBy),
    };
  },
});

/** One page of respondents with their answers, newest first. */
export const respondentsPage = serverQuery({
  args: {
    ...adminArgs,
    setId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { session, now, setId, paginationOpts }) => {
    const admin = await requireAdmin(ctx, session, now);
    const set = await requireOwnedSet(ctx, admin._id, setId);
    const page = await ctx.db
      .query('respondents')
      .withIndex('by_setId_and_enteredAt', q => q.eq('setId', set._id))
      .order('desc')
      .paginate(paginationOpts);
    const rows = await Promise.all(
      page.page.map(async respondent => {
        const response = await ctx.db
          .query('responses')
          .withIndex('by_respondentId', q =>
            q.eq('respondentId', respondent._id)
          )
          .first();
        return {
          id: respondent._id,
          profile: respondent.profile,
          enteredAt: respondent.enteredAt,
          submittedAt: respondent.submittedAt,
          answers: response?.answers ?? [],
        };
      })
    );
    return {
      page: rows,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
