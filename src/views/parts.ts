import type { ProfileField, Question } from '../../shared/model';
import type { QuestionResult } from '../../shared/results';
import { html, SafeHtml } from './html';

export type Values = Record<string, string | string[]>;
export type Errors = Record<string, string>;

function given(values: Values, key: string): string {
  const v = values[key];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

function picked(values: Values, key: string): string[] {
  const v = values[key];
  return Array.isArray(v) ? v : v ? [v] : [];
}

function errorText(id: string, errors: Errors): SafeHtml | '' {
  const message = errors[id];
  return message
    ? html`<p class="field-error" id="${id}-error">${message}</p>`
    : '';
}

const INPUT_TYPES: Partial<
  Record<ProfileField['type'], { type: string; extra: string }>
> = {
  text: { type: 'text', extra: 'autocomplete="off"' },
  email: { type: 'email', extra: 'autocomplete="email" inputmode="email"' },
  tel: { type: 'tel', extra: 'autocomplete="tel" inputmode="tel"' },
  number: { type: 'number', extra: 'inputmode="decimal" step="any"' },
  date: { type: 'date', extra: 'min="1900-01-01" max="2100-12-31"' },
};

/** One participant detail field, named `f.<id>`. */
export function profileInput(
  field: ProfileField,
  values: Values,
  errors: Errors
): SafeHtml {
  const name = `f.${field.id}`;
  const id = `f-${field.id}`;
  const invalid = errors[field.id] ? 'true' : 'false';
  const describedBy = errors[field.id] ? `${field.id}-error` : '';
  const value = given(values, field.id);
  const req = field.required
    ? html`<span class="req" aria-hidden="true">*</span>`
    : '';

  if (field.type === 'checkbox') {
    return html`<div class="field">
      <label class="choice">
        <input
          type="checkbox"
          name="${name}"
          value="yes"
          ${value ? 'checked' : ''}
          ${field.required ? 'required' : ''}
          aria-invalid="${invalid}"
          aria-describedby="${describedBy}"
        />
        <span>${field.label}${req}</span>
      </label>
      ${errorText(field.id, errors)}
    </div>`;
  }

  let control: SafeHtml;
  if (field.type === 'textarea') {
    control = html`<textarea
      class="textarea"
      id="${id}"
      name="${name}"
      maxlength="500"
      ${field.required ? 'required' : ''}
      aria-invalid="${invalid}"
      aria-describedby="${describedBy}"
    >
${value}</textarea>`;
  } else if (field.type === 'select') {
    control = html`<select
      class="select"
      id="${id}"
      name="${name}"
      ${field.required ? 'required' : ''}
      aria-invalid="${invalid}"
      aria-describedby="${describedBy}"
    >
      <option value="">Choose…</option>
      ${field.options.map(o => html`<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`)}
    </select>`;
  } else {
    const kind = INPUT_TYPES[field.type] ?? INPUT_TYPES.text!;
    control = html`<input
      class="input"
      id="${id}"
      name="${name}"
      type="${kind.type}"
      value="${value}"
      maxlength="500"
      ${new SafeHtml(kind.extra)}
      ${field.required ? 'required' : ''}
      aria-invalid="${invalid}"
      aria-describedby="${describedBy}"
    />`;
  }

  return html`<div class="field">
    <label class="field-label" for="${id}">${field.label}${req}</label>
    ${control} ${errorText(field.id, errors)}
  </div>`;
}

const HINTS: Record<Question['type'], string> = {
  single: 'Pick one',
  multiple: 'Pick any that apply',
  rating: 'Rate from 1 to 5',
  text: 'In your own words',
};

/** One question card; inputs are named `q.<id>`. */
export function questionCard(
  question: Question,
  index: number,
  values: Values,
  errors: Errors
): SafeHtml {
  const name = `q.${question.id}`;
  const chosen = picked(values, question.id);
  const number = String(index + 1).padStart(2, '0');
  const headingId = `q-${question.id}`;
  let body: SafeHtml;

  if (question.type === 'text') {
    body = html`<textarea
      class="textarea"
      name="${name}"
      maxlength="1000"
      aria-labelledby="${headingId}"
      ${question.required ? 'required' : ''}
    >
${given(values, question.id)}</textarea>`;
  } else if (question.type === 'rating') {
    body = html`<div
        class="rating"
        role="radiogroup"
        aria-labelledby="${headingId}"
      >
        ${['1', '2', '3', '4', '5'].map(
          value =>
            html`<label class="choice">
              <input
                type="radio"
                name="${name}"
                value="${value}"
                ${chosen.includes(value) ? 'checked' : ''}
                ${question.required ? 'required' : ''}
                aria-label="${value} out of 5"
              />
              <span aria-hidden="true">${value}</span>
            </label>`
        )}
      </div>
      <div class="rating-ends mono-label" aria-hidden="true">
        <span>Low</span><span>High</span>
      </div>`;
  } else {
    const type = question.type === 'multiple' ? 'checkbox' : 'radio';
    body = html`<div
      class="choices"
      role="${type === 'radio' ? 'radiogroup' : 'group'}"
      aria-labelledby="${headingId}"
    >
      ${question.options.map(
        option =>
          html`<label class="choice">
            <input
              type="${type}"
              name="${name}"
              value="${option.id}"
              ${chosen.includes(option.id) ? 'checked' : ''}
              ${type === 'radio' && question.required ? 'required' : ''}
            />
            <span>${option.label}</span>
          </label>`
      )}
    </div>`;
  }

  return html`<section class="win" aria-labelledby="${headingId}">
    <div class="win-bar">
      <span class="dot"></span><span class="dot"></span
      ><span class="dot"></span>
      <span class="path">${HINTS[question.type]}</span>
      <span class="end">${question.required ? 'Required' : 'Optional'}</span>
    </div>
    <div class="win-body">
      <h2 class="heading-3" id="${headingId}">
        <span class="q-num">${number}</span> ${question.prompt}
      </h2>
      ${body} ${errorText(question.id, errors)}
    </div>
  </section>`;
}

function votes(n: number): string {
  return `${n} ${n === 1 ? 'vote' : 'votes'}`;
}

/**
 * Bars for one question. Widths are SVG attributes, not inline styles, so
 * the strict CSP holds; `client/app.ts` updates them in place.
 */
export function resultCard(
  result: QuestionResult,
  index: number,
  mine: string[] = []
): SafeHtml {
  const top = Math.max(0, ...result.choices.map(c => c.count));
  const number = String(index + 1).padStart(2, '0');
  const meta =
    result.type === 'rating' && result.average !== null
      ? `Average ${result.average} of 5`
      : `${result.answered} answered`;

  const body =
    result.type === 'text'
      ? html`<p class="muted">
          Written answers are only shared with the creator.
        </p>`
      : html`<div class="bars">
          ${result.choices.map(
            choice =>
              html`<div
                class="bar-row${mine.includes(choice.id) ? ' mine' : ''}${top > 0 && choice.count === top ? ' lead' : ''}"
                data-choice="${choice.id}"
              >
                <span class="bar-label"
                  >${result.type === 'rating' ? `${choice.label} / 5` : choice.label}</span
                >
                <span class="bar-figure"
                  ><span data-percent>${choice.percent}%</span
                  ><small data-count>${votes(choice.count)}</small></span
                >
                <svg
                  class="bar"
                  viewBox="0 0 100 10"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <rect height="10" width="${choice.percent}"></rect>
                </svg>
              </div>`
          )}
        </div>`;

  return html`<section
    class="win"
    data-question="${result.id}"
    aria-labelledby="r-${result.id}"
  >
    <div class="win-bar">
      <span class="dot"></span><span class="dot"></span
      ><span class="dot"></span>
      <span class="path" data-meta>${meta}</span>
    </div>
    <div class="win-body">
      <h2 class="heading-3" id="r-${result.id}">
        <span class="q-num">${number}</span> ${result.prompt}
      </h2>
      ${body}
    </div>
  </section>`;
}

export function errorSummary(
  message: string,
  problems: string[] = []
): SafeHtml {
  return html`<div class="notice error" role="alert">
    <strong>${message}</strong>
    ${
      problems.length
        ? html`<ul>
            ${problems.map(p => html`<li>${p}</li>`)}
          </ul>`
        : ''
    }
  </div>`;
}
