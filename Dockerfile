# Build once, run small. Chromium lives in its own image (DRIFT §6), not here.
FROM node:26-alpine AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile
COPY packages ./packages
RUN pnpm --filter @byd/server build

FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
USER node
EXPOSE 8080
CMD ["node", "packages/server/dist/main.js"]
