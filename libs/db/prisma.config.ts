import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads .env. Load the monorepo root one for local runs; in Docker
// there is no file and the variables come from the environment.
try {
  process.loadEnvFile("../../.env");
} catch {
  // no .env file
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Not env("DATABASE_URL"): that throws when unset, and `prisma generate` must run
  // without a database (Docker build stage, typecheck on a fresh clone).
  datasource: { url: process.env.DATABASE_URL },
});
