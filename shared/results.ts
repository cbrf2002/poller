import {
  OTHER_ID,
  RATING_SCALE,
  YES_NO,
  ratingValues,
  type Answer,
  type Choice,
  type Question,
  type QuestionType,
} from './model';

/** Stored vote count for one choice (or rating value) of one question. */
export interface Tally {
  questionId: string;
  optionId: string;
  count: number;
}

/** Tally row summing the 1-based positions a ranked choice was given. */
function positionKey(optionId: string): string {
  return `${optionId}~pos`;
}

/**
 * The counter changes one answer makes: `*` counts the people who answered
 * the question, each picked choice gains one, and a ranking also adds each
 * choice's position. Submitting adds these and removing a response takes the
 * same amounts back out, so both stay in step even after the set is edited.
 */
export function tallyChanges(
  answer: Answer
): { optionId: string; amount: number }[] {
  const changes = [{ optionId: '*', amount: 1 }];
  answer.optionIds.forEach((optionId, i) => {
    changes.push({ optionId, amount: 1 });
    if (answer.ranked)
      changes.push({ optionId: positionKey(optionId), amount: i + 1 });
  });
  return changes;
}

export interface ChoiceResult {
  id: string;
  label: string;
  count: number;
  /**
   * Bar length, 0–100: share of answers, or for a ranking how near the top
   * the choice sits on average (100 = always first).
   */
  percent: number;
  /** Shown beside the bar: "40%", or "#1.4" for a ranking. */
  figure: string;
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
  /** Highest rating point, for rating questions. */
  scale: number | null;
}

function oneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

function choicesOf(question: Question): readonly Choice[] {
  if (question.type === 'rating')
    return ratingValues(question).map(value => ({ id: value, label: value }));
  if (question.type === 'yesno') return YES_NO;
  if (question.allowOther)
    return [...question.options, { id: OTHER_ID, label: 'Other' }];
  return question.options;
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
  const countOf = (questionId: string, optionId: string) =>
    counts.get(`${questionId}:${optionId}`) ?? 0;

  return questions.map(question => {
    const answered = answeredBy[question.id] ?? 0;
    const options = choicesOf(question);

    const choices = options.map(option => {
      const count = countOf(question.id, option.id);
      if (question.type === 'ranking') {
        // Choices added after some people ranked are averaged over the
        // rankings that included them.
        const last = Math.max(2, options.length);
        const position = count
          ? countOf(question.id, positionKey(option.id)) / count
          : null;
        return {
          id: option.id,
          label: option.label,
          count,
          percent:
            position === null
              ? 0
              : Math.round(((last - position) / (last - 1)) * 100),
          figure: position === null ? '—' : `#${oneDecimal(position)}`,
        };
      }
      const percent = answered ? Math.round((count / answered) * 100) : 0;
      return {
        id: option.id,
        label: option.label,
        count,
        percent,
        figure: `${percent}%`,
      };
    });

    let average: number | null = null;
    if (question.type === 'rating') {
      const votes = choices.reduce((sum, c) => sum + c.count, 0);
      const total = choices.reduce((sum, c) => sum + Number(c.id) * c.count, 0);
      average = votes ? oneDecimal(total / votes) : null;
    }

    return {
      id: question.id,
      prompt: question.prompt,
      type: question.type,
      answered,
      choices,
      average,
      scale:
        question.type === 'rating'
          ? (question.scale ?? RATING_SCALE.default)
          : null,
    };
  });
}

/** The line above a question's results. */
export function resultMeta(result: QuestionResult): string {
  if (result.type === 'rating' && result.average !== null)
    return `Average ${result.average} of ${result.scale}`;
  const verb = result.type === 'ranking' ? 'ranked' : 'answered';
  return `${result.answered} ${verb}`;
}

/** The note beside a bar's figure: votes, or what a ranking figure means. */
export function countLabel(type: QuestionType, n: number): string {
  if (type === 'ranking') return 'average spot';
  return `${n} ${n === 1 ? 'vote' : 'votes'}`;
}

/**
 * One respondent's answer as the creator reads it in the table and the CSV:
 * picked labels joined by `separator`, rankings as "A > B > C", the "Other"
 * write-in quoted after its label.
 */
export function answerSummary(
  question: Question,
  answer: Answer,
  separator: string
): string {
  if (question.type === 'text') return answer.text;
  if (question.type === 'rating') return answer.optionIds.join(separator);
  const labels = new Map(choicesOf(question).map(c => [c.id, c.label]));
  const parts = answer.optionIds.map(id =>
    id === OTHER_ID ? `Other: ${answer.text}` : (labels.get(id) ?? id)
  );
  return parts.join(answer.ranked ? ' > ' : separator);
}
