# Poller

Live poll sets. Creators build a set of questions, choose which details to
collect from people (name, birthday, email, anything), publish it and share
a code. Participants fill in their details, answer, and then watch the
results update live.

Built with NestJS on Cloudflare Workers, Convex for data and Tailwind CSS,
in the cbrf2002 portfolio's design language. See [docs/](docs) for
architecture and design notes.

## Setup

Requires Node 24 (`.node-version`) and pnpm 11.

```bash
pnpm install
pnpm build:assets
pnpm dev:convex            # first run links the Convex project and writes .env.local
```

Create `.dev.vars` for `wrangler dev`:

```ini
CONVEX_URL=https://<your-dev-deployment>.convex.cloud
POLLER_SERVER_SECRET=<same value as the Convex env var below>
```

```bash
pnpm exec convex env set POLLER_SERVER_SECRET <32+ random characters>
pnpm admin:create          # your creator account on the dev deployment
pnpm dev                   # http://localhost:8787
```

## Production

One-time:

```bash
pnpm exec convex env set --prod POLLER_SERVER_SECRET <secret>
pnpm exec wrangler secret put POLLER_SERVER_SECRET    # same secret
pnpm admin:create --prod
```

Then `pnpm deploy` pushes Convex functions and the Worker.

## Checks

```bash
pnpm type-check
pnpm lint
pnpm format:check
pnpm test
```
