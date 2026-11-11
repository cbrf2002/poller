import type { PublicResults, PublicSet } from '../backend/backend';
import { html, jsonBlock, type SafeHtml } from '../views/html';
import { icon } from '../views/icons';
import { page } from '../views/layout';
import {
  errorSummary,
  profileInput,
  questionCard,
  resultCard,
  type Errors,
  type Values,
} from '../views/parts';

export function homePage(codeError = ''): SafeHtml {
  return page({
    title: 'Poller',
    description:
      'Answer a live poll with the code your host shared, then see how everyone voted.',
    body: html`<section class="hero centered">
        <span class="eyebrow">Live polls</span>
        <h1 class="display-1">
          Ask the room<span class="serif">and hear it back</span>
        </h1>
        <p class="lead">
          Got a code from your host? Enter it to join their poll. Once you
          answer, you'll see how everyone else voted.
        </p>
      </section>
      <section class="rule crop sec-tight" aria-labelledby="join-heading">
        <form
          class="win hatch mx-auto w-full max-w-xl"
          method="get"
          action="/go"
        >
          <div class="win-bar">
            <span class="dot"></span><span class="dot"></span
            ><span class="dot"></span><span class="path">poller / join</span>
          </div>
          <div class="win-body">
            <label class="field-label" id="join-heading" for="code"
              >Poll code</label
            >
            <div class="flex flex-col gap-4 sm:flex-row">
              <input
                class="input code"
                id="code"
                name="code"
                required
                minlength="10"
                maxlength="64"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
                placeholder="e.g. k7m2qx9fha"
                aria-invalid="${codeError ? 'true' : 'false'}"
                aria-describedby="${codeError ? 'code-error' : ''}"
              />
              <div class="ctas">
                <button class="btn btn-primary" type="submit">
                  Join ${icon('arrow', 16)}
                </button>
              </div>
            </div>
            ${codeError ? html`<p class="field-error" id="code-error">${codeError}</p>` : ''}
          </div>
        </form>
      </section>`,
  });
}

function setHeader(set: PublicSet, eyebrow: string): SafeHtml {
  return html`<section class="hero">
    <span class="eyebrow">${eyebrow}</span>
    <h1 class="heading-2">${set.content.title}</h1>
    ${set.content.description ? html`<p class="lead">${set.content.description}</p>` : ''}
  </section>`;
}

export function entryPage(
  set: PublicSet,
  values: Values = {},
  errors: Errors = {}
): SafeHtml {
  const fields = set.content.fields;
  const failed = Object.keys(errors).length > 0;
  return page({
    title: set.content.title,
    body: html`${setHeader(set, 'Before you start')}
      <section class="rule crop sec-tight">
        <form
          class="mx-auto flex w-full max-w-xl flex-col gap-6"
          method="post"
          action="/p/${set.slug}/enter"
          novalidate
        >
          ${failed ? errorSummary('Check the highlighted details.') : ''}
          ${
            fields.length
              ? html`<div class="form-stack">
                  ${fields.map(f => profileInput(f, values, errors))}
                </div>`
              : html`<p class="muted">
                  No details needed. ${set.content.questions.length}
                  ${set.content.questions.length === 1 ? 'question' : 'questions'}
                  ahead.
                </p>`
          }
          <div class="ctas">
            <button class="btn btn-primary" type="submit">
              Start answering ${icon('arrow', 16)}
            </button>
          </div>
        </form>
      </section>`,
  });
}

export function pollPage(
  set: PublicSet,
  values: Values = {},
  errors: Errors = {}
): SafeHtml {
  const failed = Object.keys(errors).length > 0;
  return page({
    title: set.content.title,
    body: html`${setHeader(set, `${set.content.questions.length} ${set.content.questions.length === 1 ? 'question' : 'questions'}`)}
      <section class="rule crop sec-tight">
        <div
          class="notice warn mx-auto mb-6 w-full max-w-3xl"
          data-version-notice
          hidden
          role="status"
        >
          <span>The host just changed this poll.</span>
          <button class="btn btn-quiet" type="button" data-reload-keep>
            Load the new version
          </button>
        </div>
        <form
          class="mx-auto flex w-full max-w-3xl flex-col gap-6"
          method="post"
          action="/p/${set.slug}/submit"
          data-keep-answers="${set.slug}"
          novalidate
        >
          ${failed ? errorSummary('Some answers need another look.') : ''}
          <div class="q-list">
            ${set.content.questions.map((q, i) => questionCard(q, i, values, errors))}
          </div>
          <p class="muted text-sm">
            Answers can't be changed after you submit.
          </p>
          <div class="ctas">
            <button class="btn btn-primary" type="submit">
              Submit answers ${icon('arrow', 16)}
            </button>
          </div>
        </form>
      </section>
      ${jsonBlock('live-watch', { url: `/p/${set.slug}/version`, version: set.version })}`,
  });
}

export function resultsPage(slug: string, data: PublicResults): SafeHtml {
  const closed = data.status === 'closed';
  return page({
    title: `Results · ${data.title}`,
    body: html`<section class="hero">
        <span class="eyebrow">Thanks for answering</span>
        <h1 class="heading-2">${data.title} <em>so far</em></h1>
        <p class="mono-label">
          ${
            closed
              ? html`<span>Final results · this poll is closed</span>`
              : html`<span class="live-dot" data-live-label
                  >Updating live</span
                >`
          }
        </p>
      </section>
      <section class="rule crop sec-tight">
        <div class="stats mb-6">
          <div class="stat">
            <span class="mono-label">Responses</span
            ><span class="stat-value" data-submitted>${data.submitted}</span>
          </div>
          <div class="stat">
            <span class="mono-label">Status</span
            ><span class="stat-value">${closed ? 'Closed' : 'Open'}</span>
          </div>
        </div>
        <div class="q-list">
          ${data.results.map((r, i) => resultCard(r, i, data.mine[r.id]))}
        </div>
      </section>
      ${closed ? '' : jsonBlock('live-results', { url: `/p/${slug}/results.json` })}`,
  });
}

export function closedPage(set: PublicSet): SafeHtml {
  return page({
    title: set.content.title,
    body: html`${setHeader(set, 'Closed')}
      <section class="rule crop sec-tight">
        <div class="notice warn">This poll isn't taking answers any more.</div>
      </section>`,
  });
}

export function messagePage(
  title: string,
  message: string,
  status: string
): SafeHtml {
  return page({
    title,
    body: html`<section class="hero centered">
      <span class="eyebrow">${status}</span>
      <h1 class="heading-2">${title}</h1>
      <p class="lead">${message}</p>
      <div class="ctas">
        <a class="btn btn-secondary" href="/">Enter a poll code</a>
      </div>
    </section>`,
  });
}
