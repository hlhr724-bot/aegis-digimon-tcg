# Production deployment: the installed Dokploy command

Production prefers three reusable API slots—blue, red, and green—behind a stable gateway. When all three are occupied, a release can start an additional isolated generation named `g-<12 hex>` if host memory permits. An atomically replaced manifest routes new rooms to the new deployment. The previous deployment stops accepting new rooms and remains available for existing rooms, joins, and reconnects until cleanup proves that all three API processes have zero rooms and clients.

Each slot has three API processes and a dedicated Redis service and volume. The stable gateway serves immutable web releases and routes HTTP and WebSocket traffic to the exact process path advertised by Colyseus. Postgres and the outer edge Caddy remain outside routine releases.

All API processes append uniquely named JSONL segments to `/logs`, backed by
`/opt/aegis-rollout/logs` on the host. The shared directory survives slot replacement;
segments rotate at 256 MiB and the application removes files older than seven UTC calendar days.

## Routine API deploys

Dokploy runs the one-shot deploy controller from tools/deploy/deploy.mjs, not the default production compose command. Never run docker-compose.prod.yml with up --build; that would create competing proxies and APIs beside the gateway.

The controller rotates in this order:

- After blue: red, then green, then blue.
- After red: green, then blue, then red.
- After green: blue, then red, then green.

A slot in active or draining cannot be reused. A leftover unreferenced slot is reused only after admission is closed and every running API process reports zero rooms and zero clients. Deploy first attempts cleanup of draining and orphan deployments, then selects a free fixed slot. If none is free, it allocates a unique additional generation without changing any existing deployment. Both kinds use three API processes and their own Redis, and support the same status, rollback, and verified-empty cleanup operations. Repeating the currently active revision is a no-op, including for an additional generation. An environment change in Dokploy alone, such as a new secret, therefore does not reach the API: it takes effect with the next revision.

Before allocating an additional generation, deploy requires at least **6932 MiB of host MemAvailable**: the three API limits (1500 MiB each), Redis (384 MiB), and 2048 MiB of build/host headroom. The deployer mounts `/proc/meminfo` read-only at `/host/meminfo`. Missing, malformed, or insufficient capacity stops the deployment while existing services remain online. Generation growth is limited by available host memory rather than a fixed slot count. Empty generations are reclaimed automatically on subsequent deploys; `cleanup` can also be run separately.

Before building and again before starting services, the controller measures host
CPU usage from `/proc/stat` counter deltas over a five-second window. It admits
at most 80% busy CPU, including hypervisor steal time, and resamples up to six
windows when busy (about 30 seconds). The five-minute load average remains in
diagnostics but does not veto available CPU: it describes a historical queue,
not current utilization. See the [Linux `/proc` documentation](https://docs.kernel.org/filesystems/proc.html).
Malformed measurements or insufficient disk fail immediately. Memory is checked
again after the CPU wait; existing services and room ownership remain intact
when admission fails.

Dokploy's custom command starts at compose because Dokploy prefixes docker:

```sh
compose -p aegis-deployer \
  -f /etc/dokploy/compose/aegis-rgise8/code/docker-compose.deployer.yml \
  run --rm --build deployer \
  deploy --source /etc/dokploy/compose/aegis-rgise8/code \
         --env-file /etc/dokploy/compose/aegis-rgise8/code/.env
```

The deployer image must be built with compose run --build. Dokploy's Docker cleanup can remove every unreferenced image between releases, including a prebuilt deployer image.

## Web-only releases

A frontend-only change can use deploy-web. It builds and extracts static files, copies content-addressed assets, checks index.html, then atomically changes webRevision without starting, draining, or removing API services.

```sh
compose -p aegis-deployer \
  -f /etc/dokploy/compose/aegis-rgise8/code/docker-compose.deployer.yml \
  run --rm --build deployer \
  deploy-web --source /etc/dokploy/compose/aegis-rgise8/code \
             --env-file /etc/dokploy/compose/aegis-rgise8/code/.env
```

## Source maps

The web build emits hidden source maps. Both `deploy` and `deploy-web` move every `.map`
file out of the extracted release into `/opt/aegis-rollout/sourcemaps/<revision>/` before
copying assets, so no served directory holds them. The gateway also refuses any `.map`
path. Maintenance removes a revision's maps when it removes the release. See
[client errors](../internal-docs/ai/client-errors.md) for symbolication.

## Page load limit

The gateway answers `429` with `Retry-After` when one client loads more than 20 pages in a
10-second window. It counts only web app navigations (`Sec-Fetch-Dest: document`), never
assets or API calls. The client is the first `X-Forwarded-For` address, which the edge Caddy
sets from the Cloudflare client IP.

Real players load at most 3 pages per 10 seconds from one address. The limit stops embedded
browsers that reload a page in a loop, such as one seen on October 15, 2026 at about 55 loads
per 10 seconds. Cloudflare's single Free plan rate limiting rule protects `/matchmake/` and
`/auth/` and cannot also count page loads without lowering that limit.

## Gateway health

Every game WebSocket passes through the gateway's single event loop. If that loop stalls for
6–10 seconds, both the API ping and the client liveness probe fail, and players drop with
close code 1006 or 4010. The gateway therefore does no blocking disk reads while it serves
traffic, and every 10 seconds it writes one JSON line to stdout:

| Field                             | Meaning                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `loopMaxMs`, `loopP99Ms`          | Worst and 99th-percentile event loop delay in the last 10 seconds. |
| `webSockets`                      | Game sockets open through this gateway.                            |
| `throttledPeriods`, `throttledMs` | CPU throttling of the gateway container in the last 10 seconds.    |

Read it with `docker logs <gateway> | grep gateway.health`. A `loopMaxMs` above a few
seconds at the time of a drop burst points at the gateway; a quiet gateway with healthy API
logs points at Cloudflare or the players' networks.

## Card images

The gateway serves card images from `/opt/aegis-rollout/assets/card-images`, at `/assets/card-images/<id>.webp`. The upstream card app (TakaOtaku/Digimon-Card-App) is the source. It keeps its images in a public bucket at `web-garage.takaotaku.de`. Commit `9f666f1` of the upstream repository is a second source.

`tools/deploy/card-images.mjs` keeps the mirror current:

- It reads the image ids from the committed card data and downloads only the missing files.
- It never replaces a real image. It deletes a `-Sample` scan once the real image appears.
- When no origin has an image, it copies the scan from `data/card-images/<id>.webp` in the source checkout as `<id>-Sample.webp`. It rewrites that sample whenever the committed scan changes, so a re-cropped scan reaches production on the next sync. See [local card scans](../data/card-images/README.md).
- Every `deploy` and `deploy-web` runs it after extracting the web release. A failed sync logs a warning and does not block the release.
- A daily root cron job on the VPS runs it too, to pick up images upstream publishes between releases. Its log is `/opt/aegis-rollout/logs/card-images.log`.

```sh
docker run --rm -v /etc/dokploy:/etc/dokploy:ro -v /opt/aegis-rollout:/opt/aegis-rollout node:26-alpine \
  node /etc/dokploy/compose/aegis-rgise8/code/tools/deploy/card-images.mjs \
  --source /etc/dokploy/compose/aegis-rgise8/code --state /opt/aegis-rollout
```

In local development, Vite proxies `/assets/card-images` to the deployed Oracle VPS mirror at
`https://aegis-digi.online/assets/card-images`. `AEGIS_CARD_IMAGE_ORIGIN` overrides that mirror.

## Regional card art

Korean and Chinese printings come from the official regional sites, not from the upstream card app. The repository keeps only their data. The VPS downloads and converts the images, like the upstream mirror.

| Region  | Source                                                                  | Art IDs                      |
| ------- | ----------------------------------------------------------------------- | ---------------------------- |
| Chinese | JSON card list at `dtcgweb-api.digimoncard.cn`                          | `BT1-010-C`, `BT1-010_P1-C`… |
| Korean  | HTML card list at `digimoncard.co.kr`, behind a JavaScript cookie check | `BT1-010-K`, `BT1-010_P1-K`… |

Both sites stamp their images as samples: Korean images carry "SAMPLE", and Chinese images carry "样品图禁止转载" ("sample image, reproduction prohibited").

### Refresh the data

Run `node tools/sync-regional-card-arts.mjs` on a maintainer machine and commit the two changed files:

1. It reads both card lists and maps each printing to a canonical card. It accepts unpadded numbers (`EX5-43`) and parallel suffixes (`EX1-001P`, `P-220_BT24`).
2. It rejects a printing whose level, DP, or play cost differs from the committed card. These are mostly pre-errata prints, and their art would show stats the game does not use.
3. It assigns art IDs. The first base printing becomes `-C` or `-K`, and the other printings become `_P<n>-C` or `_P<n>-K`. `packages/shared/src/cards/data/regional-art-sources.json` records the source key and image URL of each ID. Later syncs keep those IDs and never reuse one, so a saved deck keeps its chosen art.
4. It writes `packages/shared/src/cards/data/regional-arts.json`, the art list the client reads.

`--images <dir>` also converts the images into that directory for a local preview. It needs `cwebp` (macOS: `brew install webp`). `--limit <n>` and `--concurrency <n>` bound that preview.

### Mirror the images

`tools/deploy/regional-card-images.mjs` reads `regional-art-sources.json`, downloads each missing image, converts it with `cwebp` to a 430-pixel-wide WebP, and writes `<artId>.webp` to `/opt/aegis-rollout/assets/card-images`. Like the upstream mirror, it only adds files. That matters because Cloudflare caches card images as `immutable` for a year.

- Every `deploy` and `deploy-web` runs it for up to five minutes after the upstream sync. The deployer image installs `libwebp-tools`. A failure logs a warning and does not block the release.
- The daily cron job runs it after the upstream sync, with no time limit. Without `cwebp` it logs that it skipped the regional images. The cron container installs `libwebp-tools` first:

```sh
docker run --rm --cpus 1 -v /etc/dokploy:/etc/dokploy:ro -v /opt/aegis-rollout:/opt/aegis-rollout node:26-alpine \
  sh -c "apk add --no-cache libwebp-tools >/dev/null && node /etc/dokploy/compose/aegis-rgise8/code/tools/deploy/card-images.mjs \
  --source /etc/dokploy/compose/aegis-rgise8/code --state /opt/aegis-rollout"
```

The first fill converts about 13,000 images in one long cron run. Until an image is mirrored, the client falls back to the card's base art.

## Migration from revision-named generations

The controller and gateway continue to read and route existing g-<12 hex> identifiers so those processes can drain. New deploys prefer a fixed blue, red, or green slot and use an additional generation when all fixed slots remain occupied. Do not edit the manifest or remove a generation's state directory by hand.

Before the first fixed-slot deploy, run status and inspect the installed manifest and every active or draining process. Confirm that the installed gateway routes both its current g-... identifiers and all three fixed names. The controller publishes a fixed slot as active and retains old g-... owners in draining. cleanup removes a retired generation only when admission is closed and all three processes report zero rooms and clients; unavailable or unverifiable processes block removal. Generation identifiers remain supported for both retained deployments and new additional generations.

Replacing the sole gateway disconnects established WebSockets. Upgrade gateway routing for red during a verified empty-room window, or bring up the compatible gateway alongside the old one and switch the outer proxy before stopping the old gateway. Routine manifest cutovers do not recreate the gateway.

## Status, cleanup, and rollback

deploy status reports the active and draining slots with process status. deploy cleanup checks every draining slot and removes only those proven empty. deploy rollback reactivates the most recent draining slot while retaining the current owner for existing rooms.

A draining slot empties because rooms close on their own (`apps/api/src/rooms/AegisRoom.ts`):

| Limit                                     | Default                         | Result                                                                                          |
| ----------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| No player action during a match           | 15 minutes                      | The player the game waits on concedes; with nobody connected, the room closes without a result. |
| Match finished, results screen still open | 10 minutes                      | The room closes with code `4408`. The result is already recorded.                               |
| Slot draining                             | 60 minutes after draining began | Any match, finished or not, closes with code `4408`.                                            |

The API and web bundles must remain protocol-compatible while active and draining slots overlap. A retained browser bundle checks that its replacement HTML is available before navigating, so a transient gateway error does not replace a working screen.

## Infrastructure boundary

docker-compose.gateway.yml is installed separately and is not part of routine releases. Recreating the gateway disconnects live WebSockets. The first gateway installation or incompatible routing change must use the guarded transition above.
