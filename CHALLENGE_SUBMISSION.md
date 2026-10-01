# Submission

## What I Did

I treated it as a rewrite with a plan. I spent the first 53 minutes reading the code and writing down the decisions ([DECISIONS.md](docs/DECISIONS.md)) and a phased plan ([PLAN.md](docs/PLAN.md)). After that, each phase ended in a working commit.

**Priorities, in order:**

1. **Correctness of the core flow.** The old app kept links in an in-memory `Map`, so they were lost on every restart. Its code generator could only produce a handful of codes, and new links overwrote old ones. Now:
   - Links live in Postgres via Prisma 7.
   - Codes are 7-character base62 from `crypto.randomInt`, with a unique constraint and retries on collision.
   - Clicks are counted with an atomic increment.
   - Redirects are `302` with `no-store`, so every click reaches the server and is counted. Bots are not counted.
2. **Architecture that's easy to test and change.**
   - A pnpm + Turbo monorepo where dependencies point inward:
     - `libs/engine` holds the domain service behind a repository interface and has no framework imports.
     - `libs/db` is the Prisma implementation.
     - `libs/api` is a Zod contract shared by server and web.
   - A dedicated Express 5 API owns the database, organized by feature (`features/urls`: service + router).
   - The web app (React Router v7, SSR) only talks to that API.
3. **Validation and errors.**
   - One schema validates URLs in the browser, in the web action and in the API: http/https only, max length checked after normalization, own short-link host rejected.
   - Every error returns the same envelope, and server field errors map back to the form input.
4. **Abuse prevention.**
   - Shortening is rate-limited per client IP. The web app forwards the real IP, and the API only trusts it alongside a shared secret.
   - Also: helmet, a body size limit and the URL scheme allowlist.
5. **UI.**
   - shadcn/ui: form with pending state, result card with copy, stats table with a streaming skeleton and empty state, not-found page.
   - The form also works without JavaScript.
6. **Docker.**
   - One multi-stage Dockerfile.
   - Compose startup order: db (healthy) → one-shot migrate job → server (healthy) → web.
   - Data persists in a volume across `down`/`up`.
7. **Tooling.**
   - Shared ESLint, Prettier and tsconfig in `libs/config`.
   - TypeScript 7 for `tsc` and TypeScript 6 for typescript-eslint.
   - 47 Vitest/Supertest tests, none of which need a database.

At the end I ran a multi-agent review: app code, setup, and the challenge criteria, with a filter pass on top. It found one real bug: a URL could grow past the column size after percent-encoding and cause a 500. I fixed that along with a few doc and Docker issues.

### Time spent

| Phase                                                                                 | Time   |
| ------------------------------------------------------------------------------------- | ------ |
| Exploration and planning ([DECISIONS.md](docs/DECISIONS.md), [PLAN.md](docs/PLAN.md)) | 53 min |
| Implementation of version 1 (phases 0–6: working app on Docker), reached at minute 90 | 37 min |
| Review (multi-agent), fixes and this write-up, finished at about minute 115           | 25 min |

## What I Would Do With More Time

- **Require a real `INTERNAL_API_KEY`:** Compose falls back to a committed default, which lets anyone spoof the client IP and bypass the rate limit. Fine locally; a deployment must set its own.
- **Auth and link ownership:** `/stats` lists everyone's links today.
- **Slimmer Docker images:** the runtime images still carry dev dependencies (about 1 GB).
- **Observability:** structured logs (pino), OpenTelemetry metrics and traces, Sentry.
- **Scale and features:** Redis redirect cache, counter-based codes, click analytics, link expiry, custom aliases, malicious-URL blocklist.

Full list with reasoning: [DECISIONS.md §14](docs/DECISIONS.md#14-out-of-scope--future-work).

## AI Usage

I used Claude Code throughout, as a pair rather than an autopilot. I made the decisions; it did most of the typing and checking.

- **Planning.** We explored the codebase together. I drove the architecture choices and it wrote them up in DECISIONS.md and PLAN.md, which I reviewed and corrected.
- **Implementation.** Independent phases ran in parallel git worktrees with sub-agents: the web app was built while the db and server phases were in progress. I reviewed and merged the results. I steered whenever something drifted, for example:
  - pinning TypeScript 7 for `tsc` and 6 for ESLint
  - reorganizing the server by feature
- **Review.** Three agents reviewed the app code, the setup (including a full Docker smoke test) and the challenge criteria. A fourth agent filtered their findings into "fix now", "document" and "noise". I chose which ones to fix.

Example prompts:

- "okay we can start implementing i'd suggest that if you can work things in parallel in worktrees do so"
- "lets use ts 7 for tsc and ts6 for the eslint"
- "a little extra refactor on the backend, make it have a /features folder and the url business logic with the routes there, preferably a service file and then a router file"
- "run a review with multiple agents, to check the app itself, the setup, and the AC's on the challenge description; any findings you get throw at a new agent which will filter relevant issues from noise"

### Token usage

About 39M tokens in total (main session 15.5M, sub-agents 23.8M). Almost all of it is cached context re-read on each call; new output was about 135k tokens.

## Feedback

The challenge was fun but at the same time really simple, it is in the end a simple url shortener, 2 hours seems fair enough with modern AI development.
