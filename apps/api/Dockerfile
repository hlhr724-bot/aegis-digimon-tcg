FROM node:26-alpine AS manifests
RUN npm install --global pnpm@10.30.1
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY patches ./patches
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

FROM manifests AS dependencies
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prod \
    && find node_modules/.pnpm -path '*/onnxruntime-web/dist/*' -type f \
      ! -name ort.node.min.mjs ! -name ort-wasm-simd-threaded.mjs ! -name ort-wasm-simd-threaded.wasm -delete

FROM manifests AS builder
RUN apk add --no-cache procps
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY tools/typescript ./tools/typescript

RUN pnpm --filter @aegis/shared build && pnpm --filter @aegis/api build

FROM node:26-alpine AS model
COPY tools/deploy/fetch-nsfw-model.mjs /fetch-nsfw-model.mjs
RUN node /fetch-nsfw-model.mjs /models/nsfw.onnx

FROM node:26-alpine AS runtime
WORKDIR /app

COPY --from=dependencies /app/package.json ./
COPY --from=dependencies /app/pnpm-lock.yaml ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/packages/shared/package.json ./packages/shared/
COPY --from=dependencies /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=dependencies /app/apps/api/package.json ./apps/api/
COPY --from=dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY data/kb/banlist.json ./data/kb/banlist.json
COPY --from=model /models /models

ENV AVATAR_NSFW_MODEL=/models/nsfw.onnx
ENV PORT=2567
EXPOSE 2567
CMD ["node", "apps/api/dist/index.js"]
