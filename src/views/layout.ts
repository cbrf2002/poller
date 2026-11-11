import { ASSETS } from '../generated/assets';
import { html, type SafeHtml } from './html';
import { icon } from './icons';

export interface PageOptions {
  title: string;
  description?: string;
  /** Admin pages show the admin nav and sign-out. */
  admin?: { email: string } | null;
  /** Loads the set editor script. */
  editor?: boolean;
  /** Loads Cloudflare Turnstile (the page must also widen its CSP). */
  turnstile?: boolean;
  body: SafeHtml;
}

function themeButton(): SafeHtml {
  return html`<button
    type="button"
    class="icon-btn"
    data-theme-toggle
    aria-label="Switch colour theme"
  >
    <span class="theme-icon-light">${icon('moon')}</span>
    <span class="theme-icon-dark">${icon('sun')}</span>
  </button>`;
}

function nav(admin: PageOptions['admin']): SafeHtml {
  return html`<header class="site-nav">
    <nav class="nav-inner" aria-label="Main">
      <a class="wordmark" href="${admin ? '/admin' : '/'}">
        <span class="wordmark-word">Poller</span>
      </a>
      <div class="nav-links">
        ${
          admin
            ? html`<a class="nav-link optional" href="/admin">Sets</a>
                <form method="post" action="/admin/logout">
                  <button class="nav-link" type="submit">Sign out</button>
                </form>`
            : ''
        }
        ${themeButton()}
      </div>
    </nav>
  </header>`;
}

export function page(options: PageOptions): SafeHtml {
  const title =
    options.title === 'Poller' ? 'Poller' : `${options.title} · Poller`;
  return html`<!doctype html>
    <html lang="en" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <title>${title}</title>
        ${options.description ? html`<meta name="description" content="${options.description}" />` : ''}
        <meta name="theme-color" content="#14141c" />
        <meta name="color-scheme" content="dark light" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link
          rel="preload"
          href="/fonts/archivo-display.woff2"
          as="font"
          type="font/woff2"
          crossorigin
        />
        <link
          rel="preload"
          href="/fonts/impacted.woff2"
          as="font"
          type="font/woff2"
          crossorigin
        />
        <link
          rel="preload"
          href="/fonts/geist.woff2"
          as="font"
          type="font/woff2"
          crossorigin
        />
        <link rel="stylesheet" href="${ASSETS.css}" />
        <script src="${ASSETS.boot}"></script>
        <script type="module" src="${ASSETS.app}"></script>
        ${options.editor ? html`<script type="module" src="${ASSETS.editor}"></script>` : ''}
        ${options.turnstile ? html`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&amp;onload=pollerTurnstileReady" async defer></script>` : ''}
      </head>
      <body class="antialiased">
        ${nav(options.admin)}
        <main class="frame" id="main">${options.body}</main>
        <footer class="frame rule crop">
          <div class="site-footer">
            <span>Poller</span>
            ${options.admin ? html`<span>${options.admin.email}</span>` : html`<a href="/admin">Creator sign-in</a>`}
          </div>
        </footer>
      </body>
    </html>`;
}
