import { describe, expect, test } from 'vitest';
import type { ProfileField, Question } from '../shared/model';
import { buildResults } from '../shared/results';
import {
  normalizeSetContent,
  publishProblems,
  validateAnswers,
  validateProfile,
} from '../shared/validate';

const field = (
  type: ProfileField['type'],
  extra: Partial<ProfileField> = {}
): ProfileField => ({
  id: 'f1',
  label: 'Field',
  type,
  required: true,
  options: [],
  ...extra,
});

describe('normalizeSetContent', () => {
  test('repairs a malformed payload instead of rejecting it', () => {
    const content = normalizeSetContent({
      title: `  ${'x'.repeat(500)}`,
      fields: [{ id: 'BAD ID', type: 'nonsense', label: 'Name\u0000' }, 'junk'],
      questions: [
        { id: 'q1', type: 'rating', options: [{ id: 'o1', label: 'kept?' }] },
      ],
    });
    expect(content.title).toHaveLength(120);
    expect(content.fields).toHaveLength(1);
    expect(content.fields[0]).toMatchObject({
      type: 'text',
      label: 'Name',
      required: false,
    });
    expect(content.fields[0]!.id).toMatch(/^[a-z0-9]{10}$/);
    expect(content.questions[0]!.options).toEqual([]);
  });

  test('gives duplicate ids fresh ones so votes cannot collide', () => {
    const content = normalizeSetContent({
      questions: [
        { id: 'same', type: 'single', options: [{ id: 'same', label: 'A' }] },
        { id: 'same', type: 'text' },
      ],
    });
    const ids = [
      content.questions[0]!.id,
      content.questions[0]!.options[0]!.id,
      content.questions[1]!.id,
    ];
    expect(new Set(ids).size).toBe(3);
  });
});

describe('publishProblems', () => {
  test('lists what blocks publishing', () => {
    const problems = publishProblems(
      normalizeSetContent({
        fields: [{ id: 'f1', type: 'select', label: '' }],
        questions: [
          {
            id: 'q1',
            type: 'single',
            prompt: 'Pick',
            options: [{ id: 'a', label: 'A' }],
          },
        ],
      })
    );
    expect(problems).toEqual([
      'Give the set a title.',
      'Field 1 needs a label.',
      '“Field 1” needs at least one choice.',
      '“Pick” needs at least two choices.',
    ]);
  });
});

describe('validateProfile', () => {
  test.each([
    ['email', 'Ana@Example.COM', 'ana@example.com'],
    ['number', ' 42.50 ', '42.5'],
    ['date', '2000-02-29', '2000-02-29'],
    ['tel', '+63 917 555 0101', '+63 917 555 0101'],
  ] as const)('accepts and normalises a valid %s', (type, input, stored) => {
    expect(validateProfile([field(type)], { f1: input })).toEqual({
      values: { f1: stored },
      errors: {},
    });
  });

  test.each([
    ['email', 'not-an-email'],
    ['number', '12abc'],
    ['date', '2023-02-30'],
    ['date', '1800-01-01'],
    ['tel', 'call me'],
  ] as const)('rejects an invalid %s (%s)', (type, input) => {
    expect(
      validateProfile([field(type)], { f1: input }).errors.f1
    ).toBeTruthy();
  });

  test('a dropdown only takes one of its choices', () => {
    const select = field('select', { options: ['Red', 'Blue'] });
    expect(validateProfile([select], { f1: 'Green' }).errors.f1).toBe(
      'Pick one of the choices.'
    );
    expect(validateProfile([select], { f1: 'Blue' }).values.f1).toBe('Blue');
  });

  test('a required checkbox must be ticked', () => {
    expect(validateProfile([field('checkbox')], {}).errors.f1).toBe(
      'Tick this box to continue.'
    );
    expect(validateProfile([field('checkbox')], { f1: 'yes' }).values.f1).toBe(
      'yes'
    );
  });

  test('optional fields may be left empty', () => {
    expect(
      validateProfile([field('email', { required: false })], { f1: '' })
    ).toEqual({
      values: {},
      errors: {},
    });
  });
});

describe('validateAnswers', () => {
  const single: Question = {
    id: 'q1',
    prompt: 'One',
    type: 'single',
    required: true,
    options: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  };
  const rating: Question = {
    id: 'q2',
    prompt: 'Rate',
    type: 'rating',
    required: false,
    options: [],
  };

  test('rejects choices the question does not have', () => {
    expect(validateAnswers([single], { q1: 'zzz' }).errors.q1).toMatch(
      /no longer available/
    );
  });

  test('allows only one pick on a one-choice question', () => {
    expect(validateAnswers([single], { q1: ['a', 'b'] }).errors.q1).toBe(
      'Pick only one.'
    );
  });

  test('ratings must be 1 to 5', () => {
    expect(validateAnswers([rating], { q2: '6' }).errors.q2).toBeTruthy();
    expect(validateAnswers([rating], { q2: '5' }).answers).toEqual([
      { questionId: 'q2', optionIds: ['5'], text: '' },
    ]);
  });

  test('skipped optional questions produce no answer, required ones an error', () => {
    const result = validateAnswers([single, rating], {});
    expect(result.answers).toEqual([]);
    expect(result.errors).toEqual({ q1: 'Pick an answer.' });
  });
});

describe('buildResults', () => {
  test('multiple-choice shares use the people who answered as the base', () => {
    const question: Question = {
      id: 'q',
      prompt: 'Extras',
      type: 'multiple',
      required: false,
      options: [
        { id: 'x', label: 'X' },
        { id: 'y', label: 'Y' },
      ],
    };
    const [result] = buildResults(
      [question],
      [
        { questionId: 'q', optionId: 'x', count: 2 },
        { questionId: 'q', optionId: 'y', count: 1 },
      ],
      { q: 2 }
    );
    expect(result!.choices.map(c => c.percent)).toEqual([100, 50]);
  });

  test('ratings report a one-decimal average', () => {
    const question: Question = {
      id: 'r',
      prompt: 'Rate',
      type: 'rating',
      required: true,
      options: [],
    };
    const [result] = buildResults(
      [question],
      [
        { questionId: 'r', optionId: '5', count: 2 },
        { questionId: 'r', optionId: '2', count: 1 },
      ],
      { r: 3 }
    );
    expect(result!.average).toBe(4);
    expect(result!.choices).toHaveLength(5);
  });
});
