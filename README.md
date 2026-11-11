# Poller

Live polls for a room. A host builds a set of questions, picks which details
to ask people for, publishes it and shares a short code. Participants join
with the code, answer, and then watch the results come in live.

**Live:** [poller.cbrf2002.workers.dev](https://poller.cbrf2002.workers.dev)

## Features

**For hosts**

- Poll sets with one-choice, several-choice, 1–5 rating and written-answer
  questions.
- Choose the details to collect before people answer: name, email, phone,
  birthday, number, dropdown, checkbox or any custom text, each optional or
  required.
- Edits save automatically. Once a set is published, every valid change
  reaches participants straight away; a half-finished edit never goes public.
- Publish, close (results stay visible) or unpublish a set at any time.
- Live results with per-choice bars and rating averages, a respondent table,
  and CSV export.
- Remove a single response, for example a test entry or a duplicate.

**For participants**

- Join with a 10-character code or the shared link; no account needed.
- See how everyone voted right after answering, with your own picks marked.
- Works on phones, in light and dark themes.

**Repeat protection**

- One submission per browser.
- Optionally, one response per email, name, phone or number: values are
  compared regardless of case, spacing or phone formatting.

## How it works

- **Cloudflare Workers** run a **NestJS** (Express) app that renders every
  page on the server. Small browser scripts add the editor and live updates.
- **Convex** stores the data. Only the Worker can call it: every Convex
  function requires a shared server secret.
- **Tailwind CSS** styles the pages; fonts and assets are self-hosted.

More detail: [docs/architecture.md](docs/architecture.md) and
[docs/design.md](docs/design.md).

## Security

- Strict Content Security Policy with no inline scripts or styles, and
  Trusted Types enforced.
- HSTS, frame blocking, a restrictive Permissions-Policy, and `noindex` on
  everything except the home page.
- State-changing requests must come from the same origin; cookies are
  `__Host-`, HttpOnly and SameSite.
- Host passwords are hashed with PBKDF2-SHA256; sign-in and joining are
  rate-limited. Session and participant tokens are stored only as hashes.
- CSV exports are protected against spreadsheet formula injection.

## Running it yourself

You need Node 24, pnpm 11, a [Convex](https://convex.dev) account and a
[Cloudflare](https://cloudflare.com) account.

```bash
pnpm install
pnpm build:assets
pnpm dev:convex     # links a Convex project and writes .env.local
```

Generate a secret of at least 32 random characters, give it to your Convex
dev deployment, and create `.dev.vars` for the local Worker:

```bash
pnpm exec convex env set POLLER_SERVER_SECRET <secret>
```

```ini
# .dev.vars
CONVEX_URL=https://<your-dev-deployment>.convex.cloud
POLLER_SERVER_SECRET=<secret>
```

Then create a host account and start the app on http://localhost:8787:

```bash
pnpm admin:create
pnpm dev
```

### Deploying

In `wrangler.jsonc`, replace `account_id` and `CONVEX_URL` with your own
Cloudflare account and Convex production URL. Then, once:

```bash
pnpm exec convex env set --prod POLLER_SERVER_SECRET <secret>
pnpm exec wrangler secret put POLLER_SERVER_SECRET    # same secret
pnpm admin:create --prod
```

`pnpm deploy` pushes the Convex functions and the Worker. If you connect the
repository to Cloudflare Workers Builds (build command `pnpm build:assets`,
deploy command `npx wrangler deploy`), pushes to `main` deploy the Worker;
Convex changes still go out with `pnpm exec convex deploy`.

## Development

```bash
pnpm test           # Convex functions and the Worker's HTTP behaviour
pnpm type-check
pnpm lint
pnpm format:check
```
