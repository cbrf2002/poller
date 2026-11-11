import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { answer, setContent, setStatus } from './validators';

export default defineSchema({
  admins: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    salt: v.string(),
    iterations: v.number(),
  }).index('by_email', ['email']),

  /** Admin sign-ins. Only a SHA-256 of the cookie token is stored. */
  sessions: defineTable({
    adminId: v.id('admins'),
    tokenHash: v.string(),
    expiresAt: v.number(),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_adminId', ['adminId'])
    .index('by_expiresAt', ['expiresAt']),

  sets: defineTable({
    ownerId: v.id('admins'),
    slug: v.string(),
    status: setStatus,
    /** What the editor last saved. */
    content: setContent,
    /** What participants see; refreshed from `content` whenever it is valid. */
    live: v.union(setContent, v.null()),
    revision: v.number(),
    updatedAt: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_ownerId_and_updatedAt', ['ownerId', 'updatedAt']),

  /** Counters kept apart from `sets` so votes don't contend with edits. */
  setStats: defineTable({
    setId: v.id('sets'),
    entered: v.number(),
    submitted: v.number(),
  }).index('by_setId', ['setId']),

  respondents: defineTable({
    setId: v.id('sets'),
    tokenHash: v.string(),
    profile: v.record(v.string(), v.string()),
    enteredAt: v.number(),
    submittedAt: v.union(v.number(), v.null()),
  })
    .index('by_setId_and_tokenHash', ['setId', 'tokenHash'])
    .index('by_setId_and_enteredAt', ['setId', 'enteredAt']),

  responses: defineTable({
    setId: v.id('sets'),
    respondentId: v.id('respondents'),
    answers: v.array(answer),
    submittedAt: v.number(),
  })
    .index('by_setId', ['setId'])
    .index('by_respondentId', ['respondentId']),

  /**
   * Vote counters per question choice. The `*` choice counts how many people
   * answered the question at all (the base for percentages).
   */
  tallies: defineTable({
    setId: v.id('sets'),
    questionId: v.string(),
    optionId: v.string(),
    count: v.number(),
  }).index('by_setId_and_questionId_and_optionId', [
    'setId',
    'questionId',
    'optionId',
  ]),
});
