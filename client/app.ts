import type { QuestionResult } from '../shared/results';
import { h, readJson } from './dom';

// ── Theme ─────────────────────────────────────────────────────
for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-theme-toggle]'
)) {
  button.addEventListener('click', () => {
    const dark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('poller-theme', dark ? 'dark' : 'light');
    } catch {
      // Not persisted; the choice still applies to this page.
    }
  });
}

// ── Copy link ─────────────────────────────────────────────────
for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-copy]'
)) {
  button.addEventListener('click', async () => {
    const source =
      document.querySelector<HTMLInputElement>('[data-copy-source]');
    if (!source) return;
    const label = button.lastChild;
    try {
      await navigator.clipboard.writeText(source.value);
      if (label) label.textContent = ' Copied';
    } catch {
      source.select();
      if (label) label.textContent = ' Press Ctrl+C';
    }
    setTimeout(() => {
      if (label) label.textContent = ' Copy';
    }, 2000);
  });
}

// ── Confirm destructive forms ─────────────────────────────────
for (const form of document.querySelectorAll<HTMLFormElement>(
  'form[data-confirm]'
)) {
  form.addEventListener('submit', event => {
    if (!confirm(form.dataset.confirm ?? 'Are you sure?'))
      event.preventDefault();
  });
}

/** Calls `tick` every `ms` while the tab is visible; `tick` returns false to stop. */
function poll(ms: number, tick: () => Promise<boolean>): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped && document.visibilityState === 'visible')
      timer = setTimeout(run, ms);
  };
  const run = async () => {
    try {
      stopped = !(await tick());
    } catch {
      // Network hiccup: try again next round.
    }
    schedule();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
    else clearTimeout(timer);
  });
  schedule();
}

// ── Live results ──────────────────────────────────────────────
interface LiveResults {
  submitted: number;
  status: string;
  results: QuestionResult[];
}

function votes(n: number): string {
  return `${n} ${n === 1 ? 'vote' : 'votes'}`;
}

/** Replays the row's jolt so each new vote is felt, even back to back. */
function bump(row: HTMLElement): void {
  row.classList.remove('bumped');
  void row.offsetWidth;
  row.classList.add('bumped');
}

/** Updates bars in place; returns false when the layout no longer matches. */
function applyResults(data: LiveResults): boolean {
  const cards = document.querySelectorAll<HTMLElement>('[data-question]');
  if (cards.length !== data.results.length) return false;

  for (const counter of document.querySelectorAll('[data-submitted]')) {
    counter.textContent = String(data.submitted);
  }
  for (const [i, result] of data.results.entries()) {
    const card = cards[i];
    if (!card || card.dataset.question !== result.id) return false;
    const meta = card.querySelector('[data-meta]');
    if (meta) {
      meta.textContent =
        result.type === 'rating' && result.average !== null
          ? `Average ${result.average} of 5`
          : `${result.answered} answered`;
    }
    const rows = card.querySelectorAll<HTMLElement>('[data-choice]');
    if (result.type !== 'text' && rows.length !== result.choices.length)
      return false;
    const top = Math.max(0, ...result.choices.map(c => c.count));
    for (const [j, choice] of result.choices.entries()) {
      const row = rows[j];
      if (!row) continue;
      if (row.dataset.choice !== choice.id) return false;
      row.classList.toggle('lead', top > 0 && choice.count === top);
      const percent = row.querySelector('[data-percent]');
      const count = row.querySelector('[data-count]');
      if (count && count.textContent !== votes(choice.count)) bump(row);
      if (percent) percent.textContent = `${choice.percent}%`;
      if (count) count.textContent = votes(choice.count);
      row.querySelector('rect')?.setAttribute('width', String(choice.percent));
    }
  }
  return true;
}

const live = readJson<{ url: string }>('live-results');
if (live) {
  poll(4000, async () => {
    const response = await fetch(live.url, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return response.status >= 500;
    const data = (await response.json()) as LiveResults;
    if (!applyResults(data)) {
      location.reload();
      return false;
    }
    if (data.status !== 'published') {
      document
        .querySelector('[data-live-label]')
        ?.replaceWith(h('span', {}, 'Final results · this poll is closed'));
      return false;
    }
    return true;
  });
}

// ── Live edits while answering ────────────────────────────────
const KEEP_PREFIX = 'poller-answers:';

function saveAnswers(form: HTMLFormElement): void {
  const entries: [string, string][] = [];
  for (const [name, value] of new FormData(form)) {
    if (typeof value === 'string') entries.push([name, value]);
  }
  try {
    sessionStorage.setItem(
      KEEP_PREFIX + form.dataset.keepAnswers,
      JSON.stringify(entries)
    );
  } catch {
    // Without storage the reload simply starts fresh.
  }
}

function restoreAnswers(form: HTMLFormElement): void {
  const key = KEEP_PREFIX + form.dataset.keepAnswers;
  let entries: [string, string][];
  try {
    entries = JSON.parse(sessionStorage.getItem(key) ?? '[]') as [
      string,
      string,
    ][];
    sessionStorage.removeItem(key);
  } catch {
    return;
  }
  for (const [name, value] of entries) {
    for (const field of form.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
    >(`[name="${CSS.escape(name)}"]`)) {
      if (
        field instanceof HTMLInputElement &&
        (field.type === 'radio' || field.type === 'checkbox')
      ) {
        if (field.value === value) field.checked = true;
      } else {
        field.value = value;
      }
    }
  }
}

const answerForm = document.querySelector<HTMLFormElement>(
  'form[data-keep-answers]'
);
if (answerForm) {
  restoreAnswers(answerForm);
  document
    .querySelector('[data-reload-keep]')
    ?.addEventListener('click', () => {
      saveAnswers(answerForm);
      location.reload();
    });
}

const watch = readJson<{ url: string; version: string }>('live-watch');
if (watch) {
  poll(8000, async () => {
    const response = await fetch(watch.url, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return response.status >= 500;
    const { version } = (await response.json()) as { version: string };
    if (version === watch.version) return true;
    const notice = document.querySelector<HTMLElement>('[data-version-notice]');
    if (notice) notice.hidden = false;
    return false;
  });
}

// ── Turnstile on the entry form ───────────────────────────────
interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id?: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
    pollerTurnstileReady?: () => void;
  }
}

const challenge = document.querySelector<HTMLElement>('[data-turnstile]');
if (challenge) {
  const form = challenge.closest('form');
  const submit = form?.querySelector<HTMLButtonElement>('[data-needs-check]');
  const status = form?.querySelector<HTMLElement>('[data-check-status]');
  const say = (message: string) => {
    if (!status) return;
    status.textContent = message;
    status.hidden = message === '';
  };
  // The check runs invisibly unless Cloudflare wants an interaction; hold
  // the button until a token exists, since posting without one always fails.
  if (submit) submit.disabled = true;
  const render = () => {
    const api = window.turnstile;
    if (!api || challenge.dataset.rendered) return;
    challenge.dataset.rendered = 'true';
    const id = api.render(challenge, {
      sitekey: challenge.dataset.turnstile,
      action: 'enter',
      appearance: 'interaction-only',
      size: 'flexible',
      theme: document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light',
      callback: () => {
        say('');
        if (submit) submit.disabled = false;
      },
      'expired-callback': () => {
        if (submit) submit.disabled = true;
        api.reset(id);
      },
      // Interaction-only mode hides the widget's own error state, so say it
      // here. The code is what Cloudflare's docs and support go by.
      'error-callback': (code: string) => {
        if (submit) submit.disabled = true;
        say(
          `The quick check couldn’t finish (code ${code}). Reload the page to try again.`
        );
        return true;
      },
      'unsupported-callback': () => {
        say('This browser can’t run the quick check. Try another browser.');
      },
    });
  };
  // The script may load before or after this module; cover both orders.
  window.pollerTurnstileReady = render;
  render();
}
