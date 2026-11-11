import type { ProfileField, SetStatus } from '../../shared/model';
import type {
  AdminResults,
  EditableSet,
  RespondentsPage,
  SetSummary,
} from '../backend/backend';
import { html, jsonBlock, type SafeHtml } from '../views/html';
import { icon } from '../views/icons';
import { page } from '../views/layout';
import { errorSummary, resultCard } from '../views/parts';

type Admin = { email: string };

const STATUS_NAMES: Record<SetStatus, string> = {
  draft: 'Draft',
  published: 'Live',
  closed: 'Closed',
};

function status(value: SetStatus): SafeHtml {
  return html`<span class="tag" data-status="${value}"
    >${STATUS_NAMES[value]}</span
  >`;
}

function when(timestamp: number): string {
  return (
    new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  );
}

export function loginPage(error = '', email = ''): SafeHtml {
  return page({
    title: 'Sign in',
    body: html`<section class="hero centered">
        <span class="eyebrow">Creators</span>
        <h1 class="heading-2">Sign in to <em>your sets</em></h1>
      </section>
      <section class="rule crop sec-tight">
        <form
          class="win mx-auto w-full max-w-md"
          method="post"
          action="/admin/login"
        >
          <div class="win-bar">
            <span class="dot"></span><span class="dot"></span
            ><span class="dot"></span><span class="path">poller / admin</span>
          </div>
          <div class="win-body form-stack">
            ${error ? errorSummary(error) : ''}
            <div class="field">
              <label class="field-label" for="email">Email</label>
              <input
                class="input"
                id="email"
                name="email"
                type="email"
                autocomplete="username"
                required
                value="${email}"
              />
            </div>
            <div class="field">
              <label class="field-label" for="password">Password</label>
              <input
                class="input"
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
              />
            </div>
            <div class="ctas">
              <button class="btn btn-primary" type="submit">Sign in</button>
            </div>
          </div>
        </form>
      </section>`,
  });
}

export function dashboardPage(admin: Admin, sets: SetSummary[]): SafeHtml {
  return page({
    title: 'Your sets',
    admin,
    body: html`<section class="hero">
        <span class="eyebrow"
          >${sets.length} ${sets.length === 1 ? 'set' : 'sets'}</span
        >
        <h1 class="heading-2">Your <em>poll sets</em></h1>
        <form
          class="flex w-full max-w-xl flex-col gap-4 sm:flex-row"
          method="post"
          action="/admin/sets"
        >
          <label class="sr-only" for="new-title">Title for a new set</label>
          <input
            class="input"
            id="new-title"
            name="title"
            maxlength="120"
            required
            placeholder="e.g. Friday all-hands"
          />
          <div class="ctas">
            <button class="btn btn-primary" type="submit">
              ${icon('plus', 16)} New set
            </button>
          </div>
        </form>
      </section>
      <section class="rule crop sec-tight">
        ${
          sets.length
            ? html`<div class="grid-2">
                ${sets.map(
                  set =>
                    html`<a class="win" href="/admin/sets/${set.id}">
                      <div class="win-bar">
                        <span class="dot"></span><span class="dot"></span
                        ><span class="dot"></span>
                        <span class="path code">/p/${set.slug}</span>
                        <span class="end">${icon('arrow', 14)}</span>
                      </div>
                      <div class="win-body">
                        <div class="flex items-start justify-between gap-3">
                          <h2 class="heading-3">
                            ${set.title || 'Untitled set'}
                          </h2>
                          ${status(set.status)}
                        </div>
                        <p class="mono-label">
                          ${set.questionCount}
                          ${set.questionCount === 1 ? 'question' : 'questions'}
                          · ${set.submitted} submitted · ${set.entered} joined
                        </p>
                        <p class="mono-label">Edited ${when(set.updatedAt)}</p>
                      </div>
                    </a>`
                )}
              </div>`
            : html`<div class="win hatch">
                <div class="win-body items-start">
                  <h2 class="heading-3">Nothing here yet</h2>
                  <p class="muted">
                    Name your first set above. You can add details to collect
                    and questions to ask, then publish it to get a link to
                    share.
                  </p>
                </div>
              </div>`
        }
      </section>`,
  });
}

export function editorPage(
  admin: Admin,
  set: EditableSet,
  origin: string,
  problems: string[] = []
): SafeHtml {
  const link = `${origin}/p/${set.slug}`;
  return page({
    title: set.content.title || 'Untitled set',
    admin,
    editor: true,
    body: html`<div class="editor-bar">
        <span
          class="save-state"
          data-save-state
          role="status"
          aria-live="polite"
          >All changes saved</span
        >
        <a class="btn btn-quiet" href="/admin/sets/${set.id}/results"
          >Results</a
        >
        <form
          method="post"
          action="/admin/sets/${set.id}/status"
          class="contents"
        >
          ${
            set.status === 'published'
              ? html`<button
                    class="btn btn-quiet"
                    name="status"
                    value="closed"
                    type="submit"
                  >
                    Close
                  </button>
                  <button
                    class="btn btn-quiet"
                    name="status"
                    value="draft"
                    type="submit"
                  >
                    Unpublish
                  </button>`
              : html`<button
                  class="btn btn-primary"
                  name="status"
                  value="published"
                  type="submit"
                  data-publish
                >
                  ${set.status === 'closed' ? 'Reopen' : 'Publish'}
                </button>`
          }
        </form>
      </div>
      <section class="hero !pb-10">
        <div class="flex flex-wrap items-center gap-3">
          ${status(set.status)}
          <span class="mono-label"
            >${set.submitted} submitted · ${set.entered} joined</span
          >
        </div>
        <div class="flex w-full max-w-2xl flex-col gap-3">
          <span class="field-label">Public link</span>
          <div class="flex flex-col gap-3 sm:flex-row">
            <input
              class="input code"
              readonly
              value="${link}"
              aria-label="Public link"
              data-copy-source
            />
            <div class="flex gap-3">
              <button class="btn btn-secondary" type="button" data-copy>
                ${icon('copy', 16)} Copy
              </button>
              ${set.status !== 'draft' ? html`<a class="btn btn-secondary" href="/p/${set.slug}" target="_blank" rel="noopener">${icon('external', 16)} Open</a>` : ''}
            </div>
          </div>
          <p class="field-hint" data-live-hint>
            ${
              set.status === 'draft'
                ? 'The link works once the set is published.'
                : 'Live: participants get each change as soon as it saves.'
            }
          </p>
        </div>
        <div data-problems>
          ${problems.length ? errorSummary('Fix these before publishing:', problems) : ''}
        </div>
      </section>
      <div class="rule crop sec-tight" id="editor" aria-busy="true"></div>
      <section class="rule crop sec-tight">
        <form
          method="post"
          action="/admin/sets/${set.id}/delete"
          data-confirm="Delete this set and all of its responses? This can't be undone."
        >
          <button class="btn btn-quiet btn-danger" type="submit">
            ${icon('trash', 14)} Delete set
          </button>
        </form>
      </section>
      ${jsonBlock('set-data', {
        id: set.id,
        status: set.status,
        content: set.content,
        submitted: set.submitted,
      })}`,
  });
}

function profileCell(field: ProfileField, value: string | undefined): string {
  if (!value) return '—';
  return field.type === 'checkbox' ? 'Yes' : value;
}

export function adminResultsPage(
  admin: Admin,
  data: AdminResults,
  respondents: RespondentsPage,
  cursor: string | null
): SafeHtml {
  const textQuestions = data.questions.filter(q => q.type === 'text');
  const labelFor = (questionId: string, optionIds: string[]) => {
    const q = data.questions.find(x => x.id === questionId);
    if (!q) return '';
    if (q.type === 'rating') return optionIds.join(', ');
    return optionIds
      .map(id => q.options.find(o => o.id === id)?.label ?? '')
      .filter(Boolean)
      .join(', ');
  };

  return page({
    title: `Results · ${data.title}`,
    admin,
    body: html`<section class="hero">
        <a class="mono-label" href="/admin/sets/${data.id}">← Back to editor</a>
        <div class="flex flex-wrap items-center gap-3">
          ${status(data.status)}
          ${data.status === 'published' ? html`<span class="mono-label live-dot">Updating live</span>` : ''}
        </div>
        <h1 class="heading-2">
          ${data.title || 'Untitled set'} <em>results</em>
        </h1>
        <div class="ctas">
          <a class="btn btn-secondary" href="/admin/sets/${data.id}/export.csv"
            >${icon('download', 16)} Download CSV</a
          >
        </div>
      </section>
      <section class="rule crop sec-tight">
        <div class="stats mb-6">
          <div class="stat">
            <span class="mono-label">Submitted</span
            ><span class="stat-value" data-submitted>${data.submitted}</span>
          </div>
          <div class="stat">
            <span class="mono-label">Joined</span
            ><span class="stat-value">${data.entered}</span>
          </div>
          <div class="stat">
            <span class="mono-label">Completion</span
            ><span class="stat-value"
              >${data.entered ? Math.round((data.submitted / data.entered) * 100) : 0}%</span
            >
          </div>
        </div>
        <div class="q-list">
          ${data.results.map((r, i) => resultCard(r, i))}
        </div>
      </section>
      <section class="rule crop sec-tight" aria-labelledby="people-heading">
        <div class="sec-head">
          <span class="eyebrow">People</span>
          <h2 class="heading-3" id="people-heading">
            Respondents, newest first
          </h2>
        </div>
        ${
          respondents.page.length
            ? html`<div class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Joined</th>
                        ${data.fields.map(f => html`<th>${f.label}</th>`)}
                        ${data.questions.map((q, i) => html`<th title="${q.prompt}">Q${i + 1}</th>`)}
                        <th><span class="sr-only">Remove</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${respondents.page.map(r => {
                        const answers = new Map(
                          r.answers.map(a => [a.questionId, a])
                        );
                        return html`<tr>
                          <td class="whitespace-nowrap">
                            ${when(r.enteredAt)}${r.submittedAt === null ? html`<br /><span class="mono-label">not submitted</span>` : ''}
                          </td>
                          ${data.fields.map(f => html`<td>${profileCell(f, r.profile[f.id])}</td>`)}
                          ${data.questions.map(q => {
                            const a = answers.get(q.id);
                            return html`<td>
                              ${a ? (q.type === 'text' ? a.text : labelFor(q.id, a.optionIds)) : '—'}
                            </td>`;
                          })}
                          <td class="!min-w-0">
                            <form method="post" action="/admin/sets/${data.id}/respondents/${r.id}/delete"
                              data-confirm="Remove this response? Their answers come out of the results and they can join again. This can't be undone.">
                              <button class="tool-btn danger" type="submit" title="Remove response"
                                aria-label="Remove the response from ${when(r.enteredAt)}">✕</button>
                            </form>
                          </td>
                        </tr>`;
                      })}
                    </tbody>
                  </table>
                </div>
                <div class="mt-4 flex gap-3">
                  ${cursor ? html`<a class="btn btn-quiet" href="/admin/sets/${data.id}/results">Newest</a>` : ''}
                  ${respondents.isDone ? '' : html`<a class="btn btn-quiet" href="/admin/sets/${data.id}/results?after=${encodeURIComponent(respondents.continueCursor)}">Older ${icon('arrow', 14)}</a>`}
                </div>`
            : html`<p class="muted">
                Nobody has joined yet. Share the public link to get started.
              </p>`
        }
        ${textQuestions.length ? html`<p class="field-hint mt-4">Written answers appear in the table and the CSV download.</p>` : ''}
      </section>
      ${data.status === 'published' ? jsonBlock('live-results', { url: `/admin/api/sets/${data.id}/results` }) : ''}`,
  });
}
