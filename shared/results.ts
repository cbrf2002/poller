import { RATING_VALUES, type Question, type QuestionType } from './model';

/** Stored vote count for one choice (or rating value) of one question. */
export interface Tally {
  questionId: string;
  optionId: string;
  count: number;
}

export interface ChoiceResult {
  id: string;
  label: string;
  count: number;
  /** Whole-number share of this question's answers, 0–100. */
  percent: number;
}

export interface QuestionResult {
  id: string;
  prompt: string;
  type: QuestionType;
  /** People who answered this question. */
  answered: number;
  choices: ChoiceResult[];
  /** Mean rating to one decimal, for rating questions with answers. */
  average: number | null;
}

/**
 * Turns raw tallies into per-question results. `answeredBy` holds how many
 * respondents answered each question; for multiple-choice questions it is
 * the base for percentages, so shares can add up to more than 100.
 */
export function buildResults(
  questions: Question[],
  tallies: Tally[],
  answeredBy: Record<string, number>
): QuestionResult[] {
  const counts = new Map<string, number>();
  for (const t of tallies) counts.set(`${t.questionId}:${t.optionId}`, t.count);

  return questions.map(question => {
    const answered = answeredBy[question.id] ?? 0;
    const options =
      question.type === 'rating'
        ? RATING_VALUES.map(value => ({ id: value, label: value }))
        : question.options;
    const choices = options.map(option => {
      const count = counts.get(`${question.id}:${option.id}`) ?? 0;
      return {
        id: option.id,
        label: option.label,
        count,
        percent: answered ? Math.round((count / answered) * 100) : 0,
      };
    });

    let average: number | null = null;
    if (question.type === 'rating') {
      const votes = choices.reduce((sum, c) => sum + c.count, 0);
      const total = choices.reduce((sum, c) => sum + Number(c.id) * c.count, 0);
      average = votes ? Math.round((total / votes) * 10) / 10 : null;
    }

    return {
      id: question.id,
      prompt: question.prompt,
      type: question.type,
      answered,
      choices,
      average,
    };
  });
}
