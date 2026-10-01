# Architecture Decisions

Decisions taken before the refactor, with the reasoning behind each one.

## 1. Architecture

### 1.1 Dedicated backend (`apps/server`, Express)

The web app never talks to the database. An Express server owns persistence, business rules and the redirect.

**Why:** separation of concerns. The UI can change (or a second client can appear) without touching data access, and the API is testable on its own.

- **Express 5**: async handler errors are forwarded to the error middleware natively, so there's no `try/catch` or wrapper in every route.

### 1.2 Monorepo layout and dependency direction

```
libs/config   shared eslint, tsconfig, prettier
libs/engine   domain: entity, code generator, ShortUrlService, repository interface (no deps)
libs/db       Prisma schema, client, PrismaUrlRepository   (→ engine)
libs/api      zod request/response schemas, DTOs, error envelope (shared by server + web)
apps/server   Express: routes, middleware, composition root (→ engine, db, api)
apps/web      React Router + shadcn                         (→ api only, never db)
```

**Why:** dependencies point inward. `engine` knows nothing about Prisma or HTTP, so business rules are unit-testable with a fake repository (dependency inversion). `libs/api` is the contract both sides compile against, so a schema change breaks the build instead of production.

`applications/` is renamed to `apps/`.

### 1.3 Dependency injection: manual composition root, no Awilix

A single `container.ts` in `apps/server` builds the object graph by hand:
`new ShortUrlService(new PrismaUrlRepository(prisma), generateCode)`.

**Why:** there are about four injectable things. A hand-written root gives the same dependency inversion and testability with no library, no name-based resolution and no magic. Revisit if the graph grows.

### 1.4 Import alias `@/` everywhere

**Why:** one convention across the apps, and it's what shadcn generates by default. This replaces the current `~/`.

**Scope:** apps only. Libs are consumed as TypeScript source, so a `@/` import inside a lib would resolve against the importing app's paths. Libs use relative imports.

## 2. Persistence

### 2.1 PostgreSQL + Prisma

Postgres runs as a lightweight container (`postgres:17-alpine`) with a named volume, so data survives restarts.

**Why:** the challenge requires real persistence and encourages Prisma. Postgres gives the unique constraint and atomic increments needed below.

### 2.2 Schema: single `urls` table, short code as primary key

```prisma
model Url {
  code          String    @id @db.VarChar(7)
  originalUrl   String    @map("original_url") @db.VarChar(2048)
  clickCount    Int       @default(0) @map("click_count")
  lastClickedAt DateTime? @map("last_clicked_at")
  createdAt     DateTime  @default(now()) @map("created_at")

  @@index([clickCount(sort: Desc)])
  @@map("urls")
}
```

**Why:**

- **`code` as PK:** it's the natural key and the lookup key for every redirect. The PK gives uniqueness and an index for free.
- **Store the code, not the full short URL:** the public base URL is configuration and can change without rewriting data.
- **Click count as a column with a descending index, not a separate table:** the typical query is "top N most clicked", which becomes an index scan (`ORDER BY click_count DESC LIMIT 50`). A separate counter table would duplicate the 1:1 relation. A per-click events table would need `COUNT … GROUP BY` over every click, and over-time charts aren't required.
- **`lastClickedAt`**: one cheap column that makes the stats view more useful.

### 2.3 Repository pattern

`engine` defines the `UrlRepository` interface and `libs/db` implements it with Prisma.

**Why:** the service depends on an abstraction, so tests use an in-memory fake and the database stays swappable.

## 3. Short code generation

- 7 characters, base62 (`0-9A-Za-z`), each character drawn with `crypto.randomInt(62)`.
- Insert, and on a unique violation (Prisma `P2002`) regenerate and retry, up to 5 attempts. If all fail, return a 500.

**Why:**

- 62⁷ ≈ 3.5 × 10¹² codes, so collisions are practically impossible. The retry makes the rare case correct instead of silently overwriting a link, which is what the original code did.
- `crypto` makes codes unpredictable, so links can't be enumerated.
- `randomInt` avoids the modulo bias of `randomBytes % 62`.
- The database constraint is the source of truth. Checking first and then inserting would leave a race window between the two queries.

**Duplicates**: shortening the same URL twice creates two codes. This is simpler, and once auth exists links are per-user anyway.

## 4. Redirect and click tracking

- The **API owns `GET /:code`**, and short links point at the API's public URL.
- It responds with a **302**, never a 301.
- Each click is counted with one atomic `UPDATE … SET click_count = click_count + 1, last_clicked_at = now()` (Prisma `increment`). There's no read-then-write.
- **Bots are redirected but not counted**, detected with `isbot`.
- An unknown code redirects to the web app's not-found page instead of returning a JSON 404 to a browser.

**Why:**

- **API owns the redirect:** one hop, and the click is counted where it happens.
- **302:** browsers cache 301s and stop hitting the server, so repeat clicks would never be counted.
- **Atomic increment:** concurrent clicks don't lose updates.
- **Bot skip:** link-preview crawlers (Slack, WhatsApp, iMessage unfurls) would otherwise inflate the counts.

## 5. API

| Method | Path           | Purpose                                                           |
| ------ | -------------- | ----------------------------------------------------------------- |
| POST   | `/api/shorten` | Body `{ url }` → `201 { code, shortUrl, originalUrl, createdAt }` |
| GET    | `/api/urls`    | Stats list, sorted by clicks desc (`?limit`, default 50, max 100) |
| GET    | `/health`      | Liveness and DB check, used by the Docker healthcheck             |
| GET    | `/:code`       | 302 to the original URL. Only matches `[0-9A-Za-z]{7}`            |

**Why the `/api` prefix:** a generated code could spell a route name (`shorten` is 7 base62 characters). Namespacing JSON routes under `/api` and restricting `/:code` to exactly 7 base62 characters means they can never collide.

**No CORS**: the browser never calls the JSON API directly. React Router loaders and actions call it from the server.

## 6. Validation

One set of Zod schemas in `libs/api`, used by the server (request validation) and by the web form (client-side feedback). The server is always authoritative.

URL rules:

- Must parse with `new URL()`.
- `http:` or `https:` only, which blocks `javascript:`, `data:` and similar.
- At most 2048 characters.
- Must not point at our own short-link host, which would create redirect loops.
- Trimmed and normalized before storing.

**Why:** one definition means the frontend and backend can't disagree. The scheme allowlist is the main defense against the shortener being used to deliver malicious links.

## 7. Error handling

A single global Express error middleware. Every error response has the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "fieldErrors": { "url": ["…"] } } }
```

Domain errors (`NotFoundError`, `ValidationError`, `RateLimitedError`, `CodeGenerationError`) map to status codes in one place. Unknown errors are logged and returned as a generic 500, with no stack traces leaked.

**Why:** one place to change error behavior, and one shape for the web app to parse. `fieldErrors` lets the form show the message next to the right input.

## 8. Abuse prevention

### 8.1 Rate limiting in the API, with a trusted forwarded IP

`express-rate-limit` (in-memory store) runs on `POST /api/shorten`.

The shorten form submits to a React Router action, which runs on the web server, so the API would see every request coming from the web container. To fix that:

- The web action forwards the client IP in a header together with a shared secret, `INTERNAL_API_KEY`.
- The API uses the forwarded IP **only when the secret matches**. Otherwise it uses the socket IP.

**Why:**

- The limit lives next to the resource it protects, so it covers direct API callers as well as the form. Limiting only in the web app would leave the public API open.
- Without the secret, anyone could spoof `X-Forwarded-For` and get a fresh IP on every request.

**Known limitation:** under Docker Desktop port mapping, all local requests share the gateway IP, so locally everyone looks like one client. In production a load balancer provides the real IP.

### 8.2 Other measures

- `helmet` for security headers.
- Body size limit.
- Strict validation of the URL scheme and length (§6).

## 9. Configuration

Environment variables are validated with Zod at startup, so a missing or invalid variable crashes the process immediately with a clear message.

| App    | Variables                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------- |
| server | `DATABASE_URL`, `PORT`, `PUBLIC_URL` (short-link base), `WEB_URL`, `INTERNAL_API_KEY`, `NODE_ENV` |
| web    | `API_URL` (internal, e.g. `http://server:4000`), `INTERNAL_API_KEY`, `NODE_ENV`                   |

**Why:** misconfiguration should fail at boot, not on the first request. The original code produced `undefined/s/xx` when `PUBLIC_URL` was missing.

## 10. Docker

- Services: `db` (`postgres:17-alpine`, named volume, `pg_isready` healthcheck), `server` and `web`.
- `server` waits for `db` with `depends_on: condition: service_healthy` and runs `prisma migrate deploy` before starting.
- Alpine images install `openssl`, which Prisma needs.
- `/health` backs the server's healthcheck. On SIGTERM the server closes the Prisma connection.

**Why:** `docker compose up --build` on a clean machine must produce a working, migrated system with no manual steps.

## 11. Frontend

- **shadcn/ui** on Tailwind v4: Input, Button, Card, Table, Skeleton, plus Sonner for toasts.
- **Shorten form:**
  - Client-side Zod validation (shared schema) with inline field errors.
  - Server errors mapped from `fieldErrors`.
  - Pending state via `useNavigation()`.
  - Result card with a copy-to-clipboard button.
- **Stats view:** a table of links (code, original URL, clicks, last clicked, created), sorted by clicks.
- **Two distinct states:** a skeleton while loading, and an empty state ("No links yet" with a link to the form) when there are zero links.
- Progressive enhancement: React Router `<Form>` still works without JavaScript.

**Why:** these meet the challenge requirements (reusable components, error feedback, loading states, stats view) with standard, accessible primitives instead of custom CSS.

## 12. Testing

**Vitest** across the repo.

- **Unit (`engine`):**
  - The code generator: length, alphabet.
  - The service's retry-on-collision, using a fake repository that collides N times.
  - Not-found behavior.
- **Unit (`libs/api`):** URL schema accept and reject cases.
- **HTTP (`apps/server`):** Supertest against the Express app with the in-memory repository: shorten, validation errors, redirect and bot skip, 404, error envelope shape.

**Why:** tests cover the parts where a bug loses or corrupts data (codes, redirects, counts) and the public contract. The DI setup makes the database-free tests trivial.

## 13. Tooling

`libs/config` holds the shared `tsconfig` bases, ESLint flat config and Prettier config. Turbo tasks: `build`, `dev`, `typecheck`, `lint`, `test`, plus `db:generate`, which `build` and `typecheck` depend on.

## 14. Out of scope / future work

| Item                                                 | Why it would come next                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Authentication and link ownership                    | Today the stats view lists every user's links.                                                        |
| Redis LRU cache for redirects                        | Redirect is the hot read path. Caching `code → url` takes load off Postgres.                          |
| Redis counter-based code generation                  | An incrementing counter encoded in base62 removes collisions entirely. Needs Redis, so it's deferred. |
| PostHog (or similar) for click analytics             | Referrers, geography, over-time charts, without building an events table.                             |
| Link expiry, custom aliases, malicious-URL blocklist | Common shortener features, not required here.                                                         |
