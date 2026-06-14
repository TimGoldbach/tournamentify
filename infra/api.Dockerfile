# syntax=docker/dockerfile:1
# Starting point — tune layer caching / use Next/Nest standalone output later.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN pnpm --filter @tournamentify/shared build \
  && pnpm --filter @tournamentify/api prisma:generate \
  && pnpm --filter @tournamentify/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /repo ./
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
