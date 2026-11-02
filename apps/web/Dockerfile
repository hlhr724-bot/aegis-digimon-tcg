FROM node:26-alpine AS builder
RUN apk add --no-cache procps
RUN npm install --global pnpm@10.30.1
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY patches ./patches
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY tools/translations ./tools/translations
COPY tools/typescript ./tools/typescript

ARG VITE_AEGIS_API_URL=wss://aegis-digi.online
ARG VITE_AEGIS_REVISION=development
ARG VITE_AEGIS_PUBLIC_VERSION=1.0.0-beta
ARG VITE_AEGIS_DEPLOYMENT_MODE=slots
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_TURNSTILE_SITE_KEY=
ENV VITE_AEGIS_API_URL=$VITE_AEGIS_API_URL
ENV VITE_AEGIS_REVISION=$VITE_AEGIS_REVISION
ENV VITE_AEGIS_PUBLIC_VERSION=$VITE_AEGIS_PUBLIC_VERSION
ENV VITE_AEGIS_DEPLOYMENT_MODE=$VITE_AEGIS_DEPLOYMENT_MODE
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY

RUN pnpm --filter @aegis/shared build && pnpm --filter @aegis/web build

FROM caddy:alpine
COPY --from=builder /app/apps/web/dist /usr/share/caddy
COPY docker/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
