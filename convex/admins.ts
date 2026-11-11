import { HOUR, RateLimiter } from '@convex-dev/rate-limiter';
import { ConvexError, v } from 'convex/values';
import { components } from './_generated/api';
import { internalMutation } from './_generated/server';
import { serverMutation, serverQuery } from './lib';

const limiter = new RateLimiter(components.rateLimiter, {
  failedLogin: { kind: 'token bucket', rate: 10, period: HOUR, capacity: 10 },
});

/**
 * Creates or resets the admin with this email. Internal: run it through
 * `pnpm admin:create`, which hashes the password locally first.
 */
export const upsert = internalMutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    salt: v.string(),
    iterations: v.number(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query('admins')
      .withIndex('by_email', q => q.eq('email', email))
      .unique();
    const record = { ...args, email };
    if (existing) {
      await ctx.db.replace('admins', existing._id, record);
      // A password reset signs the admin out everywhere.
      const sessions = await ctx.db
        .query('sessions')
        .withIndex('by_adminId', q => q.eq('adminId', existing._id))
        .take(500);
      for (const s of sessions) await ctx.db.delete('sessions', s._id);
      return existing._id;
    }
    return ctx.db.insert('admins', record);
  },
});

export const credentials = serverQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const admin = await ctx.db
      .query('admins')
      .withIndex('by_email', q => q.eq('email', email.trim().toLowerCase()))
      .unique();
    return admin
      ? {
          adminId: admin._id,
          passwordHash: admin.passwordHash,
          salt: admin.salt,
          iterations: admin.iterations,
        }
      : null;
  },
});

/** Whether `key` (a hashed IP) still has sign-in attempts left. */
export const loginAllowed = serverMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const status = await limiter.check(ctx, 'failedLogin', { key });
    return { ok: status.ok, retryAfter: status.retryAfter ?? 0 };
  },
});

export const recordFailedLogin = serverMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await limiter.limit(ctx, 'failedLogin', { key });
    return null;
  },
});

export const startSession = serverMutation({
  args: {
    adminId: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
    key: v.string(),
  },
  handler: async (ctx, { adminId: rawId, tokenHash, expiresAt, key }) => {
    const adminId = ctx.db.normalizeId('admins', rawId);
    if (!adminId) throw new ConvexError({ kind: 'not_found' });
    await limiter.reset(ctx, 'failedLogin', { key });
    const now = Date.now();
    const expired = await ctx.db
      .query('sessions')
      .withIndex('by_expiresAt', q => q.lt('expiresAt', now))
      .take(50);
    for (const s of expired) await ctx.db.delete('sessions', s._id);
    await ctx.db.insert('sessions', { adminId, tokenHash, expiresAt });
    return null;
  },
});

export const sessionAdmin = serverQuery({
  args: { tokenHash: v.string(), now: v.number() },
  handler: async (ctx, { tokenHash, now }) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_tokenHash', q => q.eq('tokenHash', tokenHash))
      .unique();
    if (!session || session.expiresAt <= now) return null;
    const admin = await ctx.db.get('admins', session.adminId);
    return admin ? { adminId: admin._id, email: admin.email } : null;
  },
});

export const endSession = serverMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_tokenHash', q => q.eq('tokenHash', tokenHash))
      .unique();
    if (session) await ctx.db.delete('sessions', session._id);
    return null;
  },
});
