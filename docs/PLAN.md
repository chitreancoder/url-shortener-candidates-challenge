# Execution Plan

Implements [DECISIONS.md](./DECISIONS.md). Each phase ends in a working, committed state, and each phase's **Done when** line is checked before moving on.

## Phase 0: Repo restructure and shared config

1. Rename `applications/` to `apps/` and update `pnpm-workspace.yaml`, `tsconfig.json` and the `Dockerfile`.
2. Create `libs/config`:
   - `tsconfig` bases: `base`, `node`, `react`.
   - ESLint flat config.
   - Prettier config.
3. Point every package at the shared configs.
4. Switch the web alias from `~/` to `@/`.
5. Add Vitest at the root. Add Turbo tasks `lint`, `test` and `db:generate`, with `build` and `typecheck` depending on `^build` and `db:generate`.

**Done when:** `pnpm install && pnpm typecheck && pnpm lint && pnpm build` pass, and the old app still runs.

## Phase 1: Domain (`libs/engine`)

1. Remove the in-memory `Map` and the `baseUrl` module.
2. Add:
   - the `Url` entity type
   - the `UrlRepository` interface: `create`, `findByCode`, `incrementClicks`, `listTopByClicks`
   - domain errors: `NotFoundError`, `CodeCollisionError`, `CodeGenerationError`
   - `generateCode()`: 7 characters, base62, `crypto.randomInt`
   - `ShortUrlService`: `shorten(url)` with up to 5 retries on `CodeCollisionError`, `resolve(code)`, `recordClick(code)`, `listTop(limit)`
3. Add an in-memory `UrlRepository` for tests.
4. Write the tests:
   - The generator produces 7 characters from the alphabet.
   - The retry succeeds after N collisions and throws after 5.
   - `resolve` on an unknown code throws `NotFoundError`.

**Done when:** `pnpm --filter @url-shortener/engine test` passes. The engine has no Prisma, Express or Zod imports.

## Phase 2: Contract (`libs/api`)

1. Write the Zod schemas:
   - `ShortenRequest` with the URL rules from DECISIONS §6
   - `ShortenResponse`
   - `UrlStats` and `UrlStatsList`
   - the `ErrorResponse` envelope
   - the `ErrorCode` enum
2. Export the inferred TypeScript types.
3. Write the tests: accepted and rejected URLs (scheme, length, malformed, whitespace, own host).

**Done when:** schema tests pass, and both apps can import the types.

## Phase 3: Persistence (`libs/db`)

1. Set up Prisma 7: `prisma.config.ts`, the `@prisma/adapter-pg` driver adapter, and a generated client with an explicit output path.
2. Add the `Url` model from DECISIONS §2.2 and create the initial migration.
3. Write `PrismaUrlRepository`:
   - `create` maps `P2002` to `CodeCollisionError`.
   - `incrementClicks` uses an atomic `increment` and sets `lastClickedAt`.
   - `listTopByClicks` uses `orderBy clickCount desc`.
4. Add a dev-only `docker-compose` `db` service so the migration can run locally.

**Done when:** `prisma migrate dev` applies against local Postgres, and a quick script creates, resolves and increments a row.

## Phase 4: Server (`apps/server`)

1. Validate the environment with Zod (`env.ts`), failing fast at boot.
2. Write `container.ts` as the composition root: prisma → repository → service.
3. Build the app in `app.ts`, exported separately from `index.ts` so Supertest can import it without a port:
   - `helmet`, a JSON body limit
   - `GET /health`
   - `POST /api/shorten` with `express-rate-limit` keyed by the trusted client IP (DECISIONS §8.1)
   - `GET /api/urls`
   - `GET /:code([0-9A-Za-z]{7})`: on a hit, a bot check, then `recordClick` and a 302. On a miss, redirect to `WEB_URL/not-found`.
   - Middleware that validates request bodies and query strings against the `libs/api` schemas.
   - The global error middleware that maps domain errors to the error envelope.
4. Shut down gracefully on SIGTERM and disconnect Prisma.
5. Write Supertest tests with the in-memory repository:
   - shorten 201
   - validation 400 with the envelope shape
   - redirect 302 that counts the click
   - bot redirect that doesn't count
   - unknown code
   - the rate limit returns 429
   - a spoofed forwarded IP without the secret is ignored

**Done when:** tests pass, and `curl` against the local server shortens, redirects and lists links.

## Phase 5: Web (`apps/web`)

1. Run `shadcn init` with the `@/` alias. Add `button`, `input`, `card`, `table`, `skeleton`, `sonner` and `label`.
2. Validate the environment (`API_URL`, `INTERNAL_API_KEY`) with Zod.
3. Write a server-only API client (`*.server.ts`). It forwards the client IP and the secret, and parses responses and errors with the `libs/api` schemas.
4. Build the **home page** (`/`):
   - The shorten form with client-side validation through the shared schema and inline errors.
   - Server `fieldErrors` mapped back to the input.
   - A pending state on the button.
   - A result card with a copy button and a toast.
5. Build the **stats page** (`/stats`): a table sorted by clicks, a skeleton during navigation and revalidation, and an empty state.
6. Add a **not-found page** (`/not-found`) for unknown short codes.
7. Add a layout with navigation (Shorten / Stats). Remove the old `s.$code` route.

**Done when:** the full flow works in the browser (shorten → copy → open → count increases on `/stats`), errors show in the form, and the app works with JavaScript disabled.

## Phase 6: Docker

1. Build images per app (one multi-stage Dockerfile with targets, or one per app) on Node Alpine with `openssl`.
2. In `docker-compose.yml`:
   - `db` with a volume and healthcheck
   - `server`, which depends on a healthy `db`, runs `prisma migrate deploy && node …` and has a healthcheck on `/health`
   - `web`, which depends on `server`
3. Update `.env.example` with every variable.

**Done when:** on a clean checkout, `docker compose up --build` comes up with no manual steps, the full flow works at `http://localhost:3000`, and **data survives `docker compose down && docker compose up`**.

## Phase 7: Documentation and wrap-up

1. Rewrite the `README.md` sections for the stack, local setup and Docker setup, including the note about rate limiting behind the Docker Desktop gateway.
2. Fill in `CHALLENGE_SUBMISSION.md`: what was done, what's next (DECISIONS §14), AI usage and feedback.
3. Run a final pass: `pnpm lint && pnpm typecheck && pnpm test && docker compose up --build`.

## Commit strategy

One or more commits per phase, with messages that explain _why_ (e.g. `feat(engine): base62 code generator with retry on collision, replaces 9-code generator that overwrote links`). Each commit leaves the repo building.
