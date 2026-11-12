# Architecture

## Request flow

```
Browser ──► Cloudflare Worker ──► NestJS (Express 5) ──► Convex
            │                     controllers render       queries / mutations
            └─ /assets, /fonts    HTML with the html tag   (shared secret)
               served as static
               assets first
```

1. Workers static assets answer `/assets/*`, `/fonts/*`, `/favicon.svg`,
   `/robots.txt` directly, with headers from `public/_headers`.
2. Everything else reaches `src/worker.ts`, which boots the Nest app once
   per isolate and hands each request to it with `handleAsNodeRequest`.
3. Middleware sets security headers, rejects cross-site writes and parses
   bodies (`src/app.ts`).
4. Controllers call the `Backend` port (`src/backend/backend.ts`).
   `ConvexBackend` adds the server secret to every call and turns
   `ConvexError` data into `BackendError(kind)`.
5. Pages are server-rendered strings (`src/pages`, `src/views`). Browser
   scripts add live updates and the editor; every page works without them
   except the editor.

## Live behaviour

- **Editor autosave**: `client/editor.ts` PUTs the whole set ~0.7 s after the
  last keystroke. Convex stores it as `content`. If the set is published and
  the draft passes `publishProblems`, it is also copied to `live`.
  Otherwise participants keep the last valid `live` version and the editor
  lists what to fix.
- **Participants answering**: the question page polls `/p/:code/version`
  every 8 s (paused while the tab is hidden). A changed fingerprint of
  `[status, live]` shows a notice; reloading keeps typed answers through
  `sessionStorage`.
- **Results**: participant and creator results pages poll JSON every 4 s and
  update bars in place; a layout change (question added or removed) reloads.

## Data (Convex)

| Table          | Purpose                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `admins`       | Creator accounts: email, PBKDF2 hash, salt, iterations                                                                      |
| `sessions`     | Admin sign-ins by token hash, with expiry                                                                                   |
| `sets`         | `content` (draft), `live` (public copy), `status`, `slug`, revision                                                         |
| `setStats`     | `entered` / `submitted` counters, apart from `sets` to avoid contention                                                     |
| `respondents`  | One per participant per set: token hash, profile values, timestamps                                                         |
| `detailValues` | Comparable form of each identifying detail (text, email, phone, number), checked when a field allows one response per value |
| `responses`    | One per submission: answers                                                                                                 |
| `tallies`      | Vote counters per question choice; `*` = people who answered, `<choice>~pos` = summed ranking places                        |

Statuses: `draft` (not public) → `published` (taking answers) → `closed`
(results only). Deleting a set schedules `sets.purge`, which removes its rows
in batches.

## Identity

- Creators: email + password → `__Host-poller_admin` cookie (12 h).
- Participants: no account. Entering a set sets
  `__Host-poller_p_<code>` (60 days); its hash identifies their respondent
  row, so one browser answers once and can return to the results.
- Bots: the entry form carries a Cloudflare Turnstile widget (rendered
  explicitly by `client/app.ts`, usually invisible). `POST /p/:code/enter`
  verifies the token with Cloudflare's siteverify API before anything reaches
  Convex and fails closed if Cloudflare can't be reached. Only pages showing
  the widget widen the CSP, to allow `challenges.cloudflare.com` scripts and
  frames. Turnstile is on when both `TURNSTILE_SITE_KEY` and
  `TURNSTILE_SECRET_KEY` are set; setting only one stops the Worker starting.
- Repeats across browsers: a detail field can allow one response per value
  (e.g. per email). Values are compared case- and spacing-insensitively
  (phones by digits) and recorded for every eligible field, so turning the
  option on later also covers earlier entries. Creators can remove a single
  response from the results page; its votes come back out of the tallies.
