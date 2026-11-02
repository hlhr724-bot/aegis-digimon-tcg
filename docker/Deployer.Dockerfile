FROM docker:cli AS docker_cli
FROM node:26-alpine
RUN apk add --no-cache git libwebp-tools
COPY --from=docker_cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker_cli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
WORKDIR /app
COPY tools/deploy/deploy.mjs tools/deploy/shared.mjs tools/deploy/card-images.mjs tools/deploy/regional-card-images.mjs tools/deploy/resources.mjs tools/deploy/retention.mjs tools/deploy/sourcemaps.mjs ./
ENTRYPOINT ["node", "/app/deploy.mjs"]
