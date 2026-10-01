FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /app

FROM base AS dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY libs/engine/package.json ./libs/engine/
COPY libs/config/package.json ./libs/config/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/libs/engine/node_modules ./libs/engine/node_modules
COPY --from=dependencies /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN pnpm build

FROM base AS production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/libs/engine/node_modules ./libs/engine/node_modules
COPY --from=build /app/apps/web/build ./apps/web/build
COPY libs/engine/src ./libs/engine/src
COPY apps/web/package.json ./apps/web/
COPY libs/engine/package.json ./libs/engine/
COPY libs/config/package.json ./libs/config/
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
