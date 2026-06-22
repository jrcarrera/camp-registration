FROM node:24-alpine AS build

RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/testing/package.json ./packages/testing/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @camp-registration/auth build \
    && pnpm --filter @camp-registration/contracts build \
    && pnpm --filter @camp-registration/database build \
    && pnpm --filter @camp-registration/api build

FROM node:24-alpine AS runtime

WORKDIR /workspace

COPY --from=build /workspace /workspace

EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
