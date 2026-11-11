/// <reference types="vite/client" />
import rateLimiter from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const secret = 'test-secret-that-is-long-enough-000000';
const HOUR = 60 * 60 * 1000;

function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

async function signedIn(
  t: ReturnType<typeof setup>,
  email = 'host@example.com'
) {
  const adminId = await t.mutation(internal.admins.upsert, {
    email,
    passwordHash: 'hash',
    salt: 'salt',
    iterations: 1,
  });
  const session = `session-${email}`;
  await t.mutation(api.admins.startSession, {
    secret,
    adminId,
    tokenHash: session,
    expiresAt: Date.now() + HOUR,
    key: 'ip',
  });
  return { session, now: Date.now() };
}

const content = {
  title: 'Lunch vote',
  description: '',
  fields: [
    {
      id: 'name',
      label: 'Name',
      type: 'text' as const,
      required: true,
      options: [],
    },
  ],
  questions: [
    {
      id: 'food',
      prompt: 'What should we order?',
      type: 'single' as const,
      required: true,
      options: [
        { id: 'pizza', label: 'Pizza' },
        { id: 'sushi', label: 'Sushi' },
      ],
    },
    {
      id: 'extras',
      prompt: 'Extras?',
      type: 'multiple' as const,
      required: false,
      options: [
        { id: 'drinks', label: 'Drinks' },
        { id: 'dessert', label: 'Dessert' },
      ],
    },
  ],
};

async function publishedSet(t: ReturnType<typeof setup>) {
  const admin = await signedIn(t);
  const setId = await t.mutation(api.sets.create, {
    secret,
    ...admin,
    title: 'Lunch vote',
  });
  await t.mutation(api.sets.save, { secret, ...admin, setId, content });
  await t.mutation(api.sets.changeStatus, {
    secret,
    ...admin,
    setId,
    status: 'published',
  });
  const set = await t.query(api.sets.get, { secret, ...admin, setId });
  return { admin, setId, slug: set.slug };
}

beforeEach(() => {
  vi.stubEnv('POLLER_SERVER_SECRET', secret);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('server secret', () => {
  test('calls without the shared secret are refused', async () => {
    const t = setup();
    await expect(
      t.query(api.participation.publicSet, { secret: 'wrong', slug: 'abc' })
    ).rejects.toThrow();
  });

  test('every call is refused while the secret is unset', async () => {
    vi.stubEnv('POLLER_SERVER_SECRET', '');
    const t = setup();
    await expect(
      t.query(api.participation.publicSet, { secret, slug: 'abc' })
    ).rejects.toThrow();
  });
});

describe('admin sessions', () => {
  test('expired sessions are rejected', async () => {
    const t = setup();
    const { session } = await signedIn(t);
    await expect(
      t.query(api.sets.list, { secret, session, now: Date.now() + 2 * HOUR })
    ).rejects.toThrow();
  });

  test('admins cannot open each other’s sets', async () => {
    const t = setup();
    const { setId } = await publishedSet(t);
    const other = await signedIn(t, 'other@example.com');
    await expect(
      t.query(api.sets.get, { secret, ...other, setId })
    ).rejects.toThrow();
  });

  test('failed sign-ins lock the key after ten tries', async () => {
    const t = setup();
    for (let i = 0; i < 10; i++)
      await t.mutation(api.admins.recordFailedLogin, { secret, key: 'k' });
    const gate = await t.mutation(api.admins.loginAllowed, {
      secret,
      key: 'k',
    });
    expect(gate.ok).toBe(false);
    expect(gate.retryAfter).toBeGreaterThan(0);
  });
});

describe('publishing', () => {
  test('an incomplete set cannot be published', async () => {
    const t = setup();
    const admin = await signedIn(t);
    const setId = await t.mutation(api.sets.create, {
      secret,
      ...admin,
      title: 'Empty',
    });
    await expect(
      t.mutation(api.sets.changeStatus, {
        secret,
        ...admin,
        setId,
        status: 'published',
      })
    ).rejects.toThrow();
  });

  test('drafts are invisible to the public', async () => {
    const t = setup();
    const admin = await signedIn(t);
    const setId = await t.mutation(api.sets.create, {
      secret,
      ...admin,
      title: 'Draft',
    });
    const { slug } = await t.query(api.sets.get, { secret, ...admin, setId });
    expect(
      await t.query(api.participation.publicSet, { secret, slug })
    ).toBeNull();
  });

  test('a broken edit to a live set keeps the last valid version public', async () => {
    const t = setup();
    const { admin, setId, slug } = await publishedSet(t);
    const broken = {
      ...content,
      questions: [{ ...content.questions[0]!, prompt: '' }],
    };
    const outcome = await t.mutation(api.sets.save, {
      secret,
      ...admin,
      setId,
      content: broken,
    });
    expect(outcome.live).toBe(false);
    const live = await t.query(api.participation.publicSet, { secret, slug });
    expect(live?.content.questions[0]?.prompt).toBe('What should we order?');
  });

  test('a valid edit to a live set changes its version', async () => {
    const t = setup();
    const { admin, setId, slug } = await publishedSet(t);
    const before = await t.query(api.participation.publicSet, { secret, slug });
    await t.mutation(api.sets.save, {
      secret,
      ...admin,
      setId,
      content: { ...content, title: 'Dinner vote' },
    });
    const after = await t.query(api.participation.publicSet, { secret, slug });
    expect(after?.content.title).toBe('Dinner vote');
    expect(after?.version).not.toBe(before?.version);
  });
});

describe('participation', () => {
  test('entry, submission and results tally per choice', async () => {
    const t = setup();
    const { slug } = await publishedSet(t);

    await t.mutation(api.participation.enter, {
      secret,
      slug,
      tokenHash: 'a',
      ipKey: 'ip',
      input: { name: 'Ana' },
    });
    await t.mutation(api.participation.enter, {
      secret,
      slug,
      tokenHash: 'b',
      ipKey: 'ip',
      input: { name: 'Ben' },
    });
    expect(
      await t.query(api.participation.results, { secret, slug, tokenHash: 'a' })
    ).toBeNull();

    await t.mutation(api.participation.submit, {
      secret,
      slug,
      tokenHash: 'a',
      input: { food: 'pizza', extras: ['drinks', 'dessert'] },
    });
    await t.mutation(api.participation.submit, {
      secret,
      slug,
      tokenHash: 'b',
      input: { food: 'pizza' },
    });

    const results = await t.query(api.participation.results, {
      secret,
      slug,
      tokenHash: 'a',
    });
    expect(results?.submitted).toBe(2);
    const food = results?.results.find(r => r.id === 'food');
    expect(food?.choices.map(c => [c.id, c.count, c.percent])).toEqual([
      ['pizza', 2, 100],
      ['sushi', 0, 0],
    ]);
    const extras = results?.results.find(r => r.id === 'extras');
    expect(extras?.answered).toBe(1);
    expect(results?.mine).toEqual({
      food: ['pizza'],
      extras: ['drinks', 'dessert'],
    });
  });

  test('a second submission from the same person is ignored', async () => {
    const t = setup();
    const { slug } = await publishedSet(t);
    await t.mutation(api.participation.enter, {
      secret,
      slug,
      tokenHash: 'a',
      ipKey: 'ip',
      input: { name: 'Ana' },
    });
    await t.mutation(api.participation.submit, {
      secret,
      slug,
      tokenHash: 'a',
      input: { food: 'pizza' },
    });
    await t.mutation(api.participation.submit, {
      secret,
      slug,
      tokenHash: 'a',
      input: { food: 'sushi' },
    });
    const results = await t.query(api.participation.results, {
      secret,
      slug,
      tokenHash: 'a',
    });
    expect(
      results?.results[0]?.choices.find(c => c.id === 'sushi')?.count
    ).toBe(0);
  });

  test('missing required details are reported per field', async () => {
    const t = setup();
    const { slug } = await publishedSet(t);
    await expect(
      t.mutation(api.participation.enter, {
        secret,
        slug,
        tokenHash: 'a',
        ipKey: 'ip',
        input: {},
      })
    ).rejects.toMatchObject({
      data: { kind: 'invalid', errors: { name: 'Fill this in.' } },
    });
  });

  test('a closed set takes no new answers', async () => {
    const t = setup();
    const { admin, setId, slug } = await publishedSet(t);
    await t.mutation(api.participation.enter, {
      secret,
      slug,
      tokenHash: 'a',
      ipKey: 'ip',
      input: { name: 'Ana' },
    });
    await t.mutation(api.sets.changeStatus, {
      secret,
      ...admin,
      setId,
      status: 'closed',
    });
    await expect(
      t.mutation(api.participation.submit, {
        secret,
        slug,
        tokenHash: 'a',
        input: { food: 'pizza' },
      })
    ).rejects.toMatchObject({ data: { kind: 'closed' } });
  });

  test('deleting a set removes its responses', async () => {
    const t = setup();
    const { admin, setId, slug } = await publishedSet(t);
    await t.mutation(api.participation.enter, {
      secret,
      slug,
      tokenHash: 'a',
      ipKey: 'ip',
      input: { name: 'Ana' },
    });
    await t.mutation(api.participation.submit, {
      secret,
      slug,
      tokenHash: 'a',
      input: { food: 'pizza' },
    });
    vi.useFakeTimers();
    await t.mutation(api.sets.remove, { secret, ...admin, setId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const left = await t.run(async ctx => ({
      respondents: (await ctx.db.query('respondents').collect()).length,
      responses: (await ctx.db.query('responses').collect()).length,
      tallies: (await ctx.db.query('tallies').collect()).length,
    }));
    expect(left).toEqual({ respondents: 0, responses: 0, tallies: 0 });
  });
});
