import { describe, expect, test } from 'vitest';
import type { ProfileField, Question } from '../shared/model';
import { buildResults, tallyChanges } from '../shared/results';
import {
  comparableValue,
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

describe('pick caps and sections', () => {
  const multiple = (extra: Record<string, unknown>) =>
    normalizeSetContent({
      questions: [
        {
          id: 'q1',
          type: 'multiple',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
            { id: 'c', label: 'C' },
          ],
          ...extra,
        },
      ],
    }).questions[0]!;

  test('a cap that allows every choice is no cap', () => {
    expect(multiple({ maxPicks: 2 }).maxPicks).toBe(2);
    expect(multiple({ maxPicks: 3 }).maxPicks).toBeUndefined();
    expect(multiple({ maxPicks: 0 }).maxPicks).toBeUndefined();
    expect(multiple({ maxPicks: 3, allowOther: true }).maxPicks).toBe(3);
  });

  test('a section needs a title before the set can go public', () => {
    const content = normalizeSetContent({
      title: 'Offsite',
      questions: [
        {
          id: 'q1',
          prompt: 'Coming?',
          type: 'yesno',
          section: { title: '', note: 'About travel' },
        },
      ],
    });
    expect(publishProblems(content)).toEqual([
      'The section before question 1 needs a title.',
    ]);
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

  test('ratings default to 1 to 5', () => {
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

  test('a rating takes only the points its scale has', () => {
    const ten = { ...rating, scale: 10 };
    expect(validateAnswers([ten], { q2: '10' }).errors).toEqual({});
    expect(validateAnswers([ten], { q2: '11' }).errors.q2).toBeTruthy();
    const three = { ...rating, scale: 3 };
    expect(validateAnswers([three], { q2: '4' }).errors.q2).toBeTruthy();
  });

  test('“Other” needs its write-in, and is refused where it is not offered', () => {
    const open = { ...single, allowOther: true };
    expect(validateAnswers([open], { q1: 'other' }).errors.q1).toMatch(
      /next to “Other”/
    );
    expect(
      validateAnswers([open], { q1: 'other', 'q1-other': ' Ramen ' }).answers
    ).toEqual([{ questionId: 'q1', optionIds: ['other'], text: 'Ramen' }]);
    expect(
      validateAnswers([single], { q1: 'other', 'q1-other': 'Ramen' }).errors.q1
    ).toMatch(/no longer available/);
  });

  test('a several-choice question with a cap refuses picks past it', () => {
    const capped: Question = {
      ...single,
      type: 'multiple',
      options: [...single.options, { id: 'c', label: 'C' }],
      maxPicks: 2,
    };
    expect(validateAnswers([capped], { q1: ['a', 'b'] }).errors).toEqual({});
    expect(validateAnswers([capped], { q1: ['a', 'b', 'c'] }).errors.q1).toBe(
      'Pick up to 2.'
    );
  });

  test('a yes-or-no question takes only yes or no', () => {
    const yesno: Question = { ...single, type: 'yesno', options: [] };
    expect(validateAnswers([yesno], { q1: 'yes' }).answers).toHaveLength(1);
    expect(validateAnswers([yesno], { q1: 'a' }).errors.q1).toBeTruthy();
  });

  test('a ranking must place every choice exactly once', () => {
    const ranking: Question = {
      ...single,
      type: 'ranking',
      options: [...single.options, { id: 'c', label: 'C' }],
    };
    expect(validateAnswers([ranking], { q1: ['c', 'a', 'b'] }).answers).toEqual(
      [{ questionId: 'q1', optionIds: ['c', 'a', 'b'], text: '', ranked: true }]
    );
    expect(
      validateAnswers([ranking], { q1: ['c', 'a'] }).errors.q1
    ).toBeTruthy();
    expect(
      validateAnswers([ranking], { q1: ['c', 'a', 'a'] }).errors.q1
    ).toBeTruthy();
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

  test('a ranking scores choices by their average place', () => {
    const question: Question = {
      id: 'k',
      prompt: 'Order',
      type: 'ranking',
      required: true,
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
    };
    const answers = [
      ['a', 'b', 'c'],
      ['a', 'c', 'b'],
    ].map(order => ({
      questionId: 'k',
      optionIds: order,
      text: '',
      ranked: true,
    }));
    const tallies = new Map<string, number>();
    for (const answer of answers)
      for (const { optionId, amount } of tallyChanges(answer))
        tallies.set(optionId, (tallies.get(optionId) ?? 0) + amount);
    const [result] = buildResults(
      [question],
      [...tallies]
        .filter(([id]) => id !== '*')
        .map(([optionId, count]) => ({ questionId: 'k', optionId, count })),
      { k: tallies.get('*') ?? 0 }
    );
    expect(result!.choices.map(c => [c.figure, c.percent])).toEqual([
      ['#1', 100],
      ['#2.5', 25],
      ['#2.5', 25],
    ]);
  });

  test('an “Other” choice is counted with the written ones', () => {
    const question: Question = {
      id: 'q',
      prompt: 'Lunch',
      type: 'single',
      required: true,
      options: [{ id: 'x', label: 'X' }],
      allowOther: true,
    };
    const [result] = buildResults(
      [question],
      [{ questionId: 'q', optionId: 'other', count: 1 }],
      { q: 1 }
    );
    expect(result!.choices.map(c => [c.label, c.percent])).toEqual([
      ['X', 0],
      ['Other', 100],
    ]);
  });
});

describe('comparableValue', () => {
  test('phone numbers compare by their digits', () => {
    const phone = field('tel');
    expect(comparableValue(phone, '+63 917-555 0101')).toBe(
      comparableValue(phone, '639175550101')
    );
  });

  test('names ignore case and spacing', () => {
    expect(comparableValue(field('text'), '  Ana   Cruz ')).toBe('ana cruz');
  });

  test('dates and dropdowns are never compared', () => {
    expect(comparableValue(field('date'), '2000-01-01')).toBeNull();
    expect(comparableValue(field('select'), 'Red')).toBeNull();
  });
});

test('only identifying field types keep the one-response option', () => {
  const content = normalizeSetContent({
    fields: [
      { id: 'a', type: 'email', unique: true },
      { id: 'b', type: 'date', unique: true },
    ],
  });
  expect(content.fields.map(f => f.unique)).toEqual([true, false]);
});
