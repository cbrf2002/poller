import {
  LIMITS,
  OTHER_ID,
  YES_NO,
  ratingValues,
  type ProfileField,
  type Question,
  type Section,
} from '../../shared/model';
import {
  countLabel,
  resultMeta,
  type QuestionResult,
} from '../../shared/results';
import { otherKey } from '../../shared/validate';
import { html, SafeHtml } from './html';
import { icon } from './icons';

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

/** The heading and note that open a section of questions. */
function sectionHeading(section: Section | undefined): SafeHtml | '' {
  if (!section?.title) return '';
  return html`<div class="q-section">
    <h2 class="q-section-title">${section.title}</h2>
    ${section.note ? html`<p class="q-section-note">${section.note}</p>` : ''}
  </div>`;
}

function hint(question: Question): string {
  switch (question.type) {
    case 'single':
      return 'Pick one';
    case 'multiple':
      return question.maxPicks
        ? `Pick up to ${question.maxPicks}`
        : 'Pick any that apply';
    case 'yesno':
      return 'Yes or no';
    case 'rating':
      return `Rate from 1 to ${ratingValues(question).length}`;
    case 'ranking':
      return 'Put in order, top first';
    case 'text':
      return 'In your own words';
  }
}

/** A ranking's choices in the order last submitted, else as written. */
function rankedOrder(
  question: Question,
  chosen: string[]
): Question['options'] {
  const byId = new Map(question.options.map(o => [o.id, o]));
  const order = chosen.flatMap(id => byId.get(id) ?? []);
  return order.length === question.options.length ? order : question.options;
}

/**
 * One question card; inputs are named `q.<id>`, and an "Other" write-in
 * `o.<id>`. A ranking submits its hidden inputs in the order shown, which
 * `client/app.ts` lets people change.
 */
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
    const points = ratingValues(question);
    body = html`<div
        class="rating"
        data-points="${points.length > 7 ? 'many' : 'few'}"
        role="radiogroup"
        aria-labelledby="${headingId}"
      >
        ${points.map(
          value =>
            html`<label class="choice">
              <input
                type="radio"
                name="${name}"
                value="${value}"
                ${chosen.includes(value) ? 'checked' : ''}
                ${question.required ? 'required' : ''}
                aria-label="${value} out of ${points.length}"
              />
              <span aria-hidden="true">${value}</span>
            </label>`
        )}
      </div>
      <div class="rating-ends mono-label" aria-hidden="true">
        <span>${question.lowLabel || 'Low'}</span
        ><span>${question.highLabel || 'High'}</span>
      </div>`;
  } else if (question.type === 'yesno') {
    body = html`<div
      class="rating yesno"
      role="radiogroup"
      aria-labelledby="${headingId}"
    >
      ${YES_NO.map(
        choice =>
          html`<label class="choice">
            <input
              type="radio"
              name="${name}"
              value="${choice.id}"
              ${chosen.includes(choice.id) ? 'checked' : ''}
              ${question.required ? 'required' : ''}
            />
            <span>${choice.label}</span>
          </label>`
      )}
    </div>`;
  } else if (question.type === 'ranking') {
    body = html`<ol class="ranking" data-ranking aria-labelledby="${headingId}">
        ${rankedOrder(question, chosen).map(
          (option, i) =>
            html`<li class="rank-row">
              <input type="hidden" name="${name}" value="${option.id}" />
              <span class="rank-pos" aria-hidden="true">${i + 1}</span>
              <span class="rank-label">${option.label}</span>
              <span class="rank-moves">
                <button type="button" class="icon-btn" data-move="-1" aria-label="Move ${option.label} up">${icon('up', 16)}</button>
                <button type="button" class="icon-btn" data-move="1" aria-label="Move ${option.label} down">${icon('down', 16)}</button>
              </span>
            </li>`
        )}
      </ol>
      <p class="sr-only" aria-live="polite" data-rank-status></p>`;
  } else {
    const type = question.type === 'multiple' ? 'checkbox' : 'radio';
    const required = type === 'radio' && question.required ? 'required' : '';
    body = html`<div
      class="choices"
      role="${type === 'radio' ? 'radiogroup' : 'group'}"
      aria-labelledby="${headingId}"
      ${question.maxPicks ? html`data-max-picks="${question.maxPicks}"` : ''}
    >
      ${question.options.map(
        option =>
          html`<label class="choice">
            <input
              type="${type}"
              name="${name}"
              value="${option.id}"
              ${chosen.includes(option.id) ? 'checked' : ''}
              ${required}
            />
            <span>${option.label}</span>
          </label>`
      )}
      ${
        question.allowOther
          ? html`<label class="choice choice-other">
              <input
                type="${type}"
                name="${name}"
                value="${OTHER_ID}"
                ${chosen.includes(OTHER_ID) ? 'checked' : ''}
                ${required}
              />
              <span>Other</span>
              <input
                class="input other-input"
                name="o.${question.id}"
                value="${given(values, otherKey(question.id))}"
                maxlength="${LIMITS.otherAnswer}"
                placeholder="Write your own"
                aria-label="Your other answer"
                data-other-text
              />
            </label>`
          : ''
      }
    </div>`;
  }

  return html`${sectionHeading(question.section)}<section
      class="win"
      aria-labelledby="${headingId}"
    >
    <div class="win-bar">
      <span class="dot"></span><span class="dot"></span
      ><span class="dot"></span>
      <span class="path">${hint(question)}</span>
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

/**
 * Bars for one question. Widths are SVG attributes, not inline styles, so
 * the strict CSP holds; `client/app.ts` updates them in place.
 */
export function resultCard(
  result: QuestionResult,
  index: number,
  mine: string[] = []
): SafeHtml {
  const top = Math.max(0, ...result.choices.map(c => c.percent));
  const number = String(index + 1).padStart(2, '0');
  // A ranking places every choice, so marking "your pick" would mark all.
  const own = result.type === 'ranking' ? [] : mine;

  const body =
    result.type === 'text'
      ? html`<p class="muted">
          Written answers are only shared with the creator.
        </p>`
      : html`<div class="bars">
          ${result.choices.map(
            choice =>
              html`<div
                class="bar-row${own.includes(choice.id) ? ' mine' : ''}${top > 0 && choice.percent === top ? ' lead' : ''}"
                data-choice="${choice.id}"
              >
                <span class="bar-label"
                  >${result.type === 'rating' ? `${choice.label} / ${result.scale}` : choice.label}</span
                >
                <span class="bar-figure"
                  ><span data-percent>${choice.figure}</span
                  ><small data-count>${countLabel(result.type, choice.count)}</small></span
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

  return html`${sectionHeading(result.section)}<section
    class="win"
    data-question="${result.id}"
    aria-labelledby="r-${result.id}"
  >
    <div class="win-bar">
      <span class="dot"></span><span class="dot"></span
      ><span class="dot"></span>
      <span class="path" data-meta>${resultMeta(result)}</span>
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
