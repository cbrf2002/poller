import {
  ConvexError,
  v,
  type ObjectType,
  type PropertyValidators,
} from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import {
  env,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';

function sameString(a: string, b: string): boolean {
  // Constant-time for equal lengths; the secret's length is not a secret.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function assertServer(secret: string): void {
  const expected = env.POLLER_SERVER_SECRET;
  if (!expected) throw new ConvexError({ kind: 'misconfigured' });
  if (!sameString(secret, expected))
    throw new ConvexError({ kind: 'forbidden' });
}

/**
 * Public functions in this app are only meant for the worker. These wrappers
 * add a `secret` argument and reject calls that don't carry the shared secret.
 */
export function serverQuery<A extends PropertyValidators, R>(def: {
  args: A;
  handler: (ctx: QueryCtx, args: ObjectType<A>) => Promise<R>;
}) {
  return query({
    args: { ...def.args, secret: v.string() },
    handler: async (ctx, { secret, ...args }): Promise<R> => {
      assertServer(secret);
      return def.handler(ctx, args as unknown as ObjectType<A>);
    },
  });
}

export function serverMutation<A extends PropertyValidators, R>(def: {
  args: A;
  handler: (ctx: MutationCtx, args: ObjectType<A>) => Promise<R>;
}) {
  return mutation({
    args: { ...def.args, secret: v.string() },
    handler: async (ctx, { secret, ...args }): Promise<R> => {
      assertServer(secret);
      return def.handler(ctx, args as unknown as ObjectType<A>);
    },
  });
}

/** Arguments every admin function takes: the session token hash and the time. */
export const adminArgs = { session: v.string(), now: v.number() };

export async function requireAdmin(
  ctx: QueryCtx,
  session: string,
  now: number
): Promise<Doc<'admins'>> {
  const row = await ctx.db
    .query('sessions')
    .withIndex('by_tokenHash', q => q.eq('tokenHash', session))
    .unique();
  if (!row || row.expiresAt <= now)
    throw new ConvexError({ kind: 'unauthenticated' });
  const admin = await ctx.db.get('admins', row.adminId);
  if (!admin) throw new ConvexError({ kind: 'unauthenticated' });
  return admin;
}

export async function requireOwnedSet(
  ctx: QueryCtx,
  adminId: Id<'admins'>,
  setId: string
): Promise<Doc<'sets'>> {
  const id = ctx.db.normalizeId('sets', setId);
  const set = id ? await ctx.db.get('sets', id) : null;
  if (!set || set.ownerId !== adminId)
    throw new ConvexError({ kind: 'not_found' });
  return set;
}

export async function statsFor(ctx: QueryCtx, setId: Id<'sets'>) {
  return ctx.db
    .query('setStats')
    .withIndex('by_setId', q => q.eq('setId', setId))
    .unique();
}

export async function talliesFor(ctx: QueryCtx, setId: Id<'sets'>) {
  // At most 50 questions × (20 choices + the `*` counter) rows.
  return ctx.db
    .query('tallies')
    .withIndex('by_setId_and_questionId_and_optionId', q =>
      q.eq('setId', setId)
    )
    .take(1100);
}

/** Splits stored tallies into choice counts and per-question answer counts. */
export function splitTallies(rows: Doc<'tallies'>[]) {
  const answeredBy: Record<string, number> = {};
  const tallies = [];
  for (const row of rows) {
    if (row.optionId === '*') answeredBy[row.questionId] = row.count;
    else
      tallies.push({
        questionId: row.questionId,
        optionId: row.optionId,
        count: row.count,
      });
  }
  return { tallies, answeredBy };
}
