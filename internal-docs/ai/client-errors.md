# Client error reports

The web client reports its own crashes to the API. Reports go to the API logs on the VPS
and, optionally, to a Discord channel. No third-party service is involved.

## What is captured

| Source                         | Kind                 | Where                                                       |
| ------------------------------ | -------------------- | ----------------------------------------------------------- |
| Uncaught `window` error        | `error`              | `installClientErrorListeners`, installed in `main.tsx`      |
| Unhandled promise rejection    | `unhandledRejection` | same                                                        |
| React render error in a screen | `render`             | `ClientErrorBoundary` around the screen region in `App.tsx` |

The boundary shows "Something went wrong" with a reload button. It is keyed by screen,
so navigating to another screen also recovers.

Each report is a `ClientErrorReport` (`packages/shared/src/clientErrors/`): kind, message,
stack, signature, release, route, optional room and match IDs, user agent, and time.
The match ID is the match log ID, the same one bug reports use.

## Signature and client limits

The signature is the normalized message plus the first stack frame served from the page
origin (`path:line:column`), for example
`TypeError: Cannot read properties of undefined (reading 'length') @ /assets/GameScreen-Dk3x9.js:12:3456`.
Normalization replaces numbers, hex values, and UUIDs with placeholders. Frames from other
origins or `node_modules` are skipped. Without such a frame the signature ends in
`no-app-frame`.

Per page load the client:

- sends each signature once;
- sends at most 20 reports;
- truncates the message to 1,000 and the stack to 8,000 characters;
- sends with `navigator.sendBeacon` as `text/plain`, and falls back to `fetch` with
  `keepalive`. Plain text keeps the request CORS-simple.

The reporter never throws. Reporting is on in production builds. In development and tests
it is off unless the web build sets `VITE_AEGIS_CLIENT_ERRORS=on`.

## Release

The client reports `VITE_AEGIS_REVISION`, the git SHA that `tools/deploy/deploy.mjs` passes
to the web image build. Local builds report `development`. The API adds its own
`AEGIS_REVISION` as `serverRevision`.

## API endpoint

`POST /bug-reports/client-errors` (`apps/api/src/clientErrors/installClientErrorRoutes.ts`):

- accepts a JSON or plain-text body up to the shared 1 MiB message limit in
  `packages/shared/src/protocol/gameMessageLimits.json`;
- validates every field against the shared limits, and answers `400` with a reason;
- rate-limits each address to 20 reports, refilling one every 3 seconds (`429`). Each API
  process has its own bucket;
- adds `accountId` when the request carries a valid session; a failed lookup is ignored;
- answers `204`.

Each accepted report is one INFO line in the API JSONL logs (`AEGIS_LOG_DIR`, on the VPS
`/opt/aegis-rollout/logs`). The line's `data[0]` is `client_error` and `data[1]` is the
report. INFO keeps these lines out of the Resend error emails. Log segments are kept for
12 hours. Bug report replays come from a separate per-match file; see
[replay capture](../../docs/FEEDBACK.md#replay-capture).

The endpoint lives under `/bug-reports` because the installed gateway
(`tools/deploy/gateway.mjs`) and `docker/Caddyfile` already route that prefix to the API.
A new top-level path would need a gateway reinstall, which drops live WebSockets.

## Discord alerts

Set `AEGIS_CLIENT_ERROR_WEBHOOK_URL` on the API to a Discord webhook URL. Each API
process posts the first report of each signature per release. It tracks up to 1,000
signatures and then forgets the oldest. The message holds the signature, message, top
five frames, release, route, match ID, and user agent. Mentions are disabled. A failed
webhook is logged and never delays the response. Without the variable, nothing is posted.

Production runs three API processes per slot, so one new error can alert up to three
times.

## Source maps

The web build emits hidden source maps (`build.sourcemap: "hidden"`, without embedded
sources). Bundles carry no `sourceMappingURL`, so browsers never ask for them.

During `deploy` and `deploy-web`, the controller moves every `.map` file out of the
extracted release before it copies assets to the served directory:

```text
/opt/aegis-rollout/sourcemaps/<release-sha>/assets/<chunk>.js.map
```

The gateway serves only `assets/` and `releases/<sha>/web/`, and refuses any path ending
in `.map`. The Caddy image refuses `.map` paths as well. Maintenance removes a release's
maps together with the release.

## Symbolicate a stack

1. Find the report and its release in the logs. Follow the VPS resource guard in
   [fix-discord-bug](../../.agents/skills/fix-discord-bug/SKILL.md): narrow by time and run
   every query through `aegis-safe`.

   ```sh
   ssh oracle-vps 'cd /opt/aegis-rollout/logs && find . -name "api-<YYYY-MM-DD>-*.jsonl" -newermt "<YYYY-MM-DD HH:MM>"'
   ssh oracle-vps 'cd /opt/aegis-rollout/logs && aegis-safe grep -h "\"client_error\"" <files> | head -c 8000'
   ```

2. Copy that release's maps into an ignored local directory. This only reads from the VPS.

   ```sh
   mkdir -p .local/sourcemaps/<release-sha>
   scp -r 'oracle-vps:/opt/aegis-rollout/sourcemaps/<release-sha>/assets' .local/sourcemaps/<release-sha>/
   ```

3. Save the report's `stack` to a file and run:

   ```sh
   pnpm client-error symbolicate --maps .local/sourcemaps/<release-sha> stack.txt
   pbpaste | pnpm client-error symbolicate --maps .local/sourcemaps/<release-sha>
   ```

   Each frame with a matching map prints as `at <name> (<source>:<line>:<column>)`. Other
   lines print unchanged.

To check a local production build, run `pnpm --filter @aegis/web build` and point
`--maps` at `apps/web/dist`.
