# The app container (DRIFT §3): actors, WebSockets, HTTP, and the built web app from one origin.
# Workspace packages ship TypeScript sources, so the server runs through tsx, like the worker.
# Chromium lives in its own image (DRIFT §6), not here.
FROM node:26-alpine AS build
# Node 26 images ship without corepack; pin the workspace's pnpm explicitly.
RUN npm install -g pnpm@11.24.0
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/engine/package.json packages/engine/
COPY packages/print/package.json packages/print/
COPY packages/template/package.json packages/template/
COPY packages/render/package.json packages/render/
COPY packages/screening/package.json packages/screening/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile
# onnxruntime-node (#1273) carries its binaries for every platform, ~290 MB. The app never runs a
# model — the render worker does — but the workspace installs it, so the image keeps only its own.
RUN set -eu; arch=$(node -p process.arch); for d in node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*; do \
      rm -rf "$d/darwin" "$d/win32"; find "$d/linux" -mindepth 1 -maxdepth 1 ! -name "$arch" -exec rm -rf {} +; \
    done
COPY packages ./packages
# `vite build` loads `vite.config.ts` first, and that config imports the run's own reporter from
# here (#111). The build context has to carry it or the image fails before it compiles a line.
COPY test-support ./test-support
RUN pnpm --filter @byd/web build

FROM node:26-alpine
ENV NODE_ENV=production
ENV STATIC_DIR=/app/packages/web/dist
WORKDIR /app
COPY --from=build /app /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "packages/server/node_modules/tsx/dist/cli.mjs", "packages/server/src/main.ts"]
