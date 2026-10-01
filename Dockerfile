# One Dockerfile, three targets (migrate, server, web) sharing a single build stage.
FROM node:24-alpine AS base
# Prisma's engines need openssl on Alpine.
RUN apk add --no-cache openssl && corepack enable
ENV CI=true
WORKDIR /app

FROM base AS build
# Fetch by lockfile first so the dependency layer is cached across source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile && pnpm build

# One-shot job: applies pending migrations, then exits. Reuses the build stage (needs the Prisma CLI).
FROM build AS migrate
WORKDIR /app/libs/db
CMD ["pnpm", "db:deploy"]

# Same tree minus devDependencies, resolved from the lockfile (workspace libs are bundled
# into the app builds, so only third-party runtime deps are needed).
FROM build AS prod-deps
RUN pnpm install --prod --offline --frozen-lockfile

FROM base AS server
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/package.json /app/apps/server/
COPY --from=build /app/apps/server/dist /app/apps/server/dist
WORKDIR /app/apps/server
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]

FROM base AS web
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/apps/web/package.json /app/apps/web/server.js /app/apps/web/
COPY --from=build /app/apps/web/build /app/apps/web/build
WORKDIR /app/apps/web
USER node
EXPOSE 3000
CMD ["node", "server.js"]
