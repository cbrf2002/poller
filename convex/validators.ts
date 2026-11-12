import { v } from 'convex/values';
import { FIELD_TYPES, QUESTION_TYPES, SET_STATUSES } from '../shared/model';

function literals<T extends string>(values: readonly T[]) {
  const [first, second, ...rest] = values.map(value => v.literal(value));
  return v.union(first!, second!, ...rest);
}

export const setStatus = literals(SET_STATUSES);

export const profileField = v.object({
  id: v.string(),
  label: v.string(),
  type: literals(FIELD_TYPES),
  required: v.boolean(),
  options: v.array(v.string()),
  unique: v.optional(v.boolean()),
});

export const question = v.object({
  id: v.string(),
  prompt: v.string(),
  type: literals(QUESTION_TYPES),
  required: v.boolean(),
  options: v.array(v.object({ id: v.string(), label: v.string() })),
  allowOther: v.optional(v.boolean()),
  maxPicks: v.optional(v.number()),
  section: v.optional(v.object({ title: v.string(), note: v.string() })),
  scale: v.optional(v.number()),
  lowLabel: v.optional(v.string()),
  highLabel: v.optional(v.string()),
});

export const setContent = v.object({
  title: v.string(),
  description: v.string(),
  fields: v.array(profileField),
  questions: v.array(question),
});

export const answer = v.object({
  questionId: v.string(),
  optionIds: v.array(v.string()),
  text: v.string(),
  ranked: v.optional(v.boolean()),
});

/** Raw form input keyed by field or question id. */
export const formInput = v.record(
  v.string(),
  v.union(v.string(), v.array(v.string()))
);
