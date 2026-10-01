# URL Shortener

Shorten URLs, redirect, and track clicks. Design decisions and their reasoning live in [docs/DECISIONS.md](docs/DECISIONS.md).

## Tech Stack

```
url-shortener/
├── apps/
│   ├── server/   # Express 5 API: shorten, stats, redirect (owns the DB)
│   └── web/      # React Router v7 (SSR) + shadcn/ui, talks only to the API
└── libs/
    ├── engine/   # Domain: ShortUrlService, code generator, repository port (no deps)
    ├── db/       # Prisma 7 schema, migrations, PrismaUrlRepository
    ├── api/      # Zod contract shared by server and web
    └── config/   # Shared tsconfig, ESLint, Prettier
```

| Technology                                                                        | Used for                                                 |
| --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [pnpm](https://pnpm.io/) + [Turbo](https://turbo.build/)                          | Monorepo workspaces and task orchestration               |
| [Express 5](https://expressjs.com/)                                               | API server                                               |
| [PostgreSQL 17](https://www.postgresql.org/) + [Prisma 7](https://prisma.io)      | Persistence and migrations                               |
| [Zod](https://zod.dev/)                                                           | Request/response contract and env validation             |
| [React Router v7](https://reactrouter.com/)                                       | SSR web app (loaders/actions)                            |
| [shadcn/ui](https://ui.shadcn.com/) + [Tailwind CSS v4](https://tailwindcss.com/) | UI components                                            |
| [Vitest](https://vitest.dev/) + [Supertest](https://github.com/ladjs/supertest)   | Tests                                                    |
| [TypeScript](https://www.typescriptlang.org/)                                     | TS 7 for `tsc`, TS 6 API for tooling (see DECISIONS §13) |

## Docker Setup

Requires Docker with Compose v2.

```bash
docker compose up --build
```

| URL                     | What                                                       |
| ----------------------- | ---------------------------------------------------------- |
| `http://localhost:3000` | Web app (shorten form, `/stats`)                           |
| `http://localhost:4000` | API; short links look like `http://localhost:4000/AbC123x` |

Startup order is handled by Compose: `db` (healthy) → `migrate` (applies Prisma migrations, then exits) → `server` (healthy on `/health`) → `web`. Data is kept in the `db-data` volume, so it survives `docker compose down` / `up`. To wipe it: `docker compose down -v`.

`INTERNAL_API_KEY` has a local default in `docker-compose.yml`; set it in your shell or a `.env` file for anything beyond local use.

> **Rate limiting under Docker Desktop:** shortening is limited to 10 requests per minute per client IP. With Docker Desktop port mapping every local request arrives from the same gateway IP, so locally all browsers share one bucket. Behind a real load balancer each client gets its own (DECISIONS §8.1).

## Local Setup

Requires Node 22+ and pnpm 10 (`corepack enable`).

```bash
pnpm install
cp .env.example .env
docker compose up -d db          # Postgres only
pnpm -C libs/db db:deploy        # apply migrations
pnpm dev                         # web on :3000, API on :4000
```

Open `http://localhost:3000`.

| Command                      | What                                           |
| ---------------------------- | ---------------------------------------------- |
| `pnpm test`                  | All unit and HTTP tests (no DB needed)         |
| `pnpm lint`                  | ESLint                                         |
| `pnpm typecheck`             | TypeScript across all packages                 |
| `pnpm format`                | Prettier                                       |
| `pnpm build`                 | Production builds                              |
| `pnpm -C libs/db db:migrate` | Create/apply a migration after a schema change |

## API

| Method | Path           | Description                                                                 |
| ------ | -------------- | --------------------------------------------------------------------------- |
| POST   | `/api/shorten` | `{ "url": "https://…" }` → `201 { code, shortUrl, originalUrl, createdAt }` |
| GET    | `/api/urls`    | Links sorted by clicks, `?limit=1..100` (default 50)                        |
| GET    | `/:code`       | `302` to the original URL and counts the click (bots not counted)           |
| GET    | `/health`      | Liveness + DB check                                                         |

Errors always have the shape `{ "error": { "code", "message", "fieldErrors"? } }`.
