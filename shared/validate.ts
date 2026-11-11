import { newItemId } from './ids';
import {
  FIELD_TYPES,
  ITEM_ID_PATTERN,
  LIMITS,
  QUESTION_TYPES,
  RATING_VALUES,
  UNIQUE_FIELD_TYPES,
  type Answer,
  type Choice,
  type FieldType,
  type ProfileField,
  type Question,
  type QuestionType,
  type SetContent,
} from './model';

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Control characters other than tab, newline and carriage return.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Trims, strips control characters and clamps to `max` characters. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, '').trim().slice(0, max);
}

function cleanId(value: unknown, taken: Set<string>): string {
  let id =
    typeof value === 'string' && ITEM_ID_PATTERN.test(value)
      ? value
      : newItemId();
  while (taken.has(id)) id = newItemId();
  taken.add(id);
  return id;
}

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function list(value: unknown, max: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

/**
 * Coerces an editor payload into a storable set. Autosave must never fail on
 * a half-typed draft, so this repairs instead of rejecting; `publishProblems`
 * decides whether the result is ready for the public.
 */
export function normalizeSetContent(input: unknown): SetContent {
  const raw = isRecord(input) ? input : {};
  const ids = new Set<string>();

  const fields: ProfileField[] = list(raw.fields, LIMITS.fields)
    .filter(isRecord)
    .map(f => {
      const type: FieldType = pick(f.type, FIELD_TYPES, 'text');
      return {
        id: cleanId(f.id, ids),
        label: cleanText(f.label, LIMITS.label),
        type,
        required: f.required === true,
        unique: f.unique === true && UNIQUE_FIELD_TYPES.includes(type),
        options:
          type === 'select'
            ? list(f.options, LIMITS.choices)
                .map(o => cleanText(o, LIMITS.choice))
                .filter(Boolean)
            : [],
      };
    });

  const questions: Question[] = list(raw.questions, LIMITS.questions)
    .filter(isRecord)
    .map(q => {
      const type: QuestionType = pick(q.type, QUESTION_TYPES, 'single');
      const options: Choice[] =
        type === 'single' || type === 'multiple'
          ? list(q.options, LIMITS.choices)
              .filter(isRecord)
              .map(o => ({
                id: cleanId(o.id, ids),
                label: cleanText(o.label, LIMITS.choice),
              }))
          : [];
      return {
        id: cleanId(q.id, ids),
        prompt: cleanText(q.prompt, LIMITS.label),
        type,
        required: q.required === true,
        options,
      };
    });

  return {
    title: cleanText(raw.title, LIMITS.title),
    description: cleanText(raw.description, LIMITS.description),
    fields,
    questions,
  };
}

/** Reasons a set can't go public yet; empty when it can. */
export function publishProblems(content: SetContent): string[] {
  const problems: string[] = [];
  if (!content.title) problems.push('Give the set a title.');
  if (content.questions.length === 0)
    problems.push('Add at least one question.');
  content.fields.forEach((field, i) => {
    const name = field.label || `Field ${i + 1}`;
    if (!field.label) problems.push(`Field ${i + 1} needs a label.`);
    if (field.type === 'select' && field.options.filter(Boolean).length < 1) {
      problems.push(`“${name}” needs at least one choice.`);
    }
  });
  content.questions.forEach((question, i) => {
    const name = question.prompt || `Question ${i + 1}`;
    if (!question.prompt) problems.push(`Question ${i + 1} needs a prompt.`);
    if (question.type === 'single' || question.type === 'multiple') {
      const labelled = question.options.filter(o => o.label);
      if (labelled.length < 2)
        problems.push(`“${name}” needs at least two choices.`);
      if (labelled.length !== question.options.length) {
        problems.push(`“${name}” has an empty choice.`);
      }
    }
  });
  return problems;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()\-.]{5,24}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CHECKED = new Set(['on', 'true', 'yes', '1']);

function checkField(
  field: ProfileField,
  rawValue: unknown
): { value: string; error?: string } {
  if (field.type === 'checkbox') {
    const value =
      typeof rawValue === 'string' && CHECKED.has(rawValue) ? 'yes' : '';
    return field.required && !value
      ? { value, error: 'Tick this box to continue.' }
      : { value };
  }

  const value = cleanText(rawValue, LIMITS.fieldValue);
  if (!value)
    return field.required ? { value, error: 'Fill this in.' } : { value };

  switch (field.type) {
    case 'email':
      return EMAIL.test(value) && value.length <= 254
        ? { value: value.toLowerCase() }
        : { value, error: 'Enter an email like name@example.com.' };
    case 'tel':
      return PHONE.test(value)
        ? { value }
        : { value, error: 'Enter a phone number using digits.' };
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n)
        ? { value: String(n) }
        : { value, error: 'Enter a number.' };
    }
    case 'date': {
      const match = ISO_DATE.exec(value);
      const date = match ? new Date(`${value}T00:00:00Z`) : null;
      const year = match ? Number(match[1]) : 0;
      const real =
        date &&
        !Number.isNaN(date.getTime()) &&
        date.toISOString().startsWith(value);
      return real && year >= 1900 && year <= 2100
        ? { value }
        : { value, error: 'Enter a real date.' };
    }
    case 'select':
      return field.options.includes(value)
        ? { value }
        : { value, error: 'Pick one of the choices.' };
    default:
      return { value };
  }
}

export interface ProfileCheck {
  values: Record<string, string>;
  errors: Record<string, string>;
}

/** Checks a participant's details against the set's fields. */
export function validateProfile(
  fields: ProfileField[],
  input: Raw
): ProfileCheck {
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const result = checkField(field, input[field.id]);
    if (result.value) values[field.id] = result.value;
    if (result.error) errors[field.id] = result.error;
  }
  return { values, errors };
}

/**
 * The form of a detail value used to spot repeats, so "Ana@X.com " and
 * "ana@x.com" or "+63 917-555 0101" and "639175550101" count as the same.
 * Null for types that are never compared.
 */
export function comparableValue(
  field: ProfileField,
  value: string
): string | null {
  if (!UNIQUE_FIELD_TYPES.includes(field.type) || !value) return null;
  if (field.type === 'tel') return value.replace(/\D/g, '') || null;
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Message for a detail that another respondent already used. */
export function repeatedValueError(field: ProfileField): string {
  return field.type === 'email'
    ? 'Someone has already answered with this email.'
    : `Someone has already answered with this ${field.label.toLowerCase() || 'value'}.`;
}

function asList(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === 'string');
  return typeof value === 'string' && value ? [value] : [];
}

export interface AnswerCheck {
  answers: Answer[];
  errors: Record<string, string>;
}

/**
 * Checks submitted answers against the set's questions. `input` maps a
 * question id to the submitted value(s). Unknown questions are ignored.
 */
export function validateAnswers(
  questions: Question[],
  input: Raw
): AnswerCheck {
  const answers: Answer[] = [];
  const errors: Record<string, string> = {};

  for (const question of questions) {
    const given = asList(input[question.id]);
    let answer: Answer | null = null;

    if (question.type === 'text') {
      const text = cleanText(given[0], LIMITS.textAnswer);
      if (text) answer = { questionId: question.id, optionIds: [], text };
    } else {
      const allowed: readonly string[] =
        question.type === 'rating'
          ? RATING_VALUES
          : question.options.map(o => o.id);
      const picked = [...new Set(given)];
      if (picked.some(id => !allowed.includes(id))) {
        errors[question.id] = 'That choice is no longer available. Pick again.';
        continue;
      }
      if (question.type !== 'multiple' && picked.length > 1) {
        errors[question.id] = 'Pick only one.';
        continue;
      }
      if (picked.length)
        answer = { questionId: question.id, optionIds: picked, text: '' };
    }

    if (answer) answers.push(answer);
    else if (question.required) {
      errors[question.id] =
        question.type === 'text' ? 'Write an answer.' : 'Pick an answer.';
    }
  }
  return { answers, errors };
}
