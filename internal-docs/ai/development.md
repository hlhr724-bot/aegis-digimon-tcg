# Development

Requires Node 26 and pnpm 10. Run commands from the repository root.

| Task                                                               | Command                                      |
| ------------------------------------------------------------------ | -------------------------------------------- |
| Run shared (watch), API on `:2567`, web on `:5173`                 | `pnpm dev`                                   |
| Build everything                                                   | `pnpm build`                                 |
| Type-check application code (also the `pre-push` hook)             | `pnpm typecheck`                             |
| Lint and format check (Oxlint, Oxfmt)                              | `pnpm check`                                 |
| Full CI suite                                                      | `pnpm run ci`                                |
| Repository tool tests                                              | `pnpm test:tools`                            |
| Simulator verification gate                                        | `pnpm verify:simulator`                      |
| Replay a reported match (see [AGENTS.md](../../AGENTS.md))         | `pnpm replay --help`                         |
| Symbolicate a client error (see [client errors](client-errors.md)) | `pnpm client-error symbolicate --maps <dir>` |

The API build and default typecheck exclude test files and test-only support directories. The build also emits shared scenario fixtures for CLI and browser imports; the default typecheck excludes unreferenced fixtures. `pnpm typecheck:tests` explicitly checks the API test program when needed. It preserves the previous exclusion of `src/engine/fuzzer.test.ts`, whose existing strict-nullability errors remain outside the type gate; runtime verification still executes that suite. Imported runtime fixtures remain part of the application module graph. Default builds and workspace typechecks run packages sequentially. The scenario CLI retains `tools/typescript/runTsc.mjs` as a compatibility entrypoint delegating to the same memory monitor. Every workspace compiler script runs through `tools/typescript/tsc.mjs`, preserving `--singleThreaded` and limiting Go parallelism to two. The API uses a 768 MiB Go heap target and a 1536 MiB RSS ceiling; shared uses a 384 MiB heap target and a 768 MiB RSS ceiling; web uses a 512 MiB heap target and a 1536 MiB RSS ceiling. The runner samples the compiler process tree every 250 ms on macOS/Linux with `ps` and Windows with PowerShell, reports peak sampled RSS, and terminates only its own compiler process group if the ceiling is exceeded (exit 137). This is a monitored limit, not a kernel allocation limit: brief overshoot between samples is possible. A failed memory measurement stops compilation rather than continuing unmonitored. `GOMEMLIMIT` alone is a soft heap target, and `NODE_OPTIONS` controls Node processes only. Do not overlap compiler commands during local bug investigations. A resource-limit failure is not a successful typecheck; reduce the checked scope instead of removing the guard.

Run `pnpm check:fix` to apply lint/format fixes; review the diff, then run `pnpm check`.

### Game message limits

`packages/shared/src/protocol/gameMessageLimits.json` owns the 1 MiB incoming message
limit. The API WebSocket transport, JSON/text/form parsers and the gateway's buffered
legacy requests consume it. The pinned Colyseus matchmaking reader also accepts 1 MiB.
Keep browser harnesses on `createGameTransport` so they exercise the production limit.
Individual field validation and replay/artifact storage limits remain domain contracts.

WebSocket code `1009` means a message was too large. Code `1006` only records an abnormal
closure; correlate the client report in `connection_drops` before assigning a cause.
The client discards queued intents after `1009`, reconnects to restore the pending
decision and shows a localized explanation rather than resending the rejected payload.

Trigger-order decisions advertise `acceptsIndexedResolutionPlan` when indexed responses are supported. The client then sends `orderIndexes` and optional `optionalAnswersByIndex`, aligned to the offered trigger keys, instead of repeating long effect identifiers. The API validates and expands these indexes before applying existing decision guards. Legacy named responses remain accepted; clients use them when the capability is absent. Replays retain the submitted representation and resolve through the same decision manager.

The development server proxies card art to the deployed Oracle VPS mirror at
`https://aegis-digi.online/assets/card-images`. Set `AEGIS_CARD_IMAGE_ORIGIN` to another
mirror with the same filenames to override it. The same environment variable applies
to browser tests.

### API tests (`apps/api`)

| Task                                                                   | Command                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| One file                                                               | `pnpm --filter @aegis/api exec vitest run src/engine/scenarios/<file>.test.ts` |
| One test by name                                                       | add `-t "<name>"` to the command above                                         |
| Fast inner loop (skips cards, conformance, fuzzer, `mechanic.test.ts`) | `pnpm --filter @aegis/api test:fast`                                           |
| Engine only                                                            | `pnpm --filter @aegis/api test:engine`                                         |
| Cards only                                                             | `pnpm --filter @aegis/api test:cards`                                          |
| Conformance                                                            | `pnpm --filter @aegis/api test:conformance`                                    |
| Postgres atomicity lane (needs `POSTGRES_TEST_URL`)                    | `pnpm --filter @aegis/api test:postgres`                                       |

Build `@aegis/shared` first when a focused test depends on changed shared code. `pnpm --filter @aegis/api test` does this for you.

### Web tests (`apps/web`)

- Unit: `pnpm --filter @aegis/web exec vitest run <path>`
- Browser (Playwright): see [testing guidance](testing.md).

## Releasing

`develop` is the default branch for development and the base for feature and fix
branches. Target development PRs at `develop` and use
`.github/PULL_REQUEST_TEMPLATE.md`. `main` is the release branch. Normal releases
use a PR from `develop` into `main` and the template at
`.github/PULL_REQUEST_TEMPLATE/release.md`. Use merge commits and preserve both
long-lived branches. After a release or hotfix, synchronize `main` back into
`develop` through a PR. Do not publish from a development branch.

See the "Releasing" section of `README.md` for preparation and publication.
Release text needs English, Portuguese (`pt-BR`), Spanish (`es`), and Italian (`it`)
entries in `apps/web/src/releases/`.

## Direct imports and aliases

Import the defining file rather than an `index` barrel. The web app uses its existing
`@/` alias. The API and shared package use Node package import maps (`#api/` and
`#shared/`), which resolve to source under the development condition and compiled
output in production. TypeScript uses the `types` condition for source declarations.
Cross-workspace direct imports use `@aegis/shared/<domain>/<file>` and the shared
package's subpath exports. The source replay CLI explicitly enables development
resolution; compiled API commands use the default production mapping.

Legacy package entrypoints serve existing consumers outside the migrated domain.
Do not add new consumers to them. Remove a legacy barrel only after migrating its
callers and preserving any initialization it owns.

## Deck providers

DigiLab is registered in `apps/api/src/deckProviders/providers/digilab.ts`. Set `AEGIS_DIGILAB_API_KEY` in the server environment; it is never sent to the browser. The read-only provider endpoints live under `/deck-providers/digilab`. The API validates lists against the requested match format.

DigiLab's [public API documentation](https://digilab.cards/docs) specifies read-only GET endpoints (verified 2026-10-17). The existing provider key does not establish permission or a contract for publishing tournament results. Automatic result submission requires a separately documented write integration from DigiLab.

The weekly scheduler runs on Sundays at 06:00 UTC (03:00 São Paulo), checked every minute, and catches up once after a restart. It is enabled in production when a key exists; set `AEGIS_PROVIDER_SYNC_ENABLED=false` to disable, or `true` to enable locally. It collects every released competitive set returned by DigiLab, up to 25 popular archetypes per set, and three recent lists per archetype, including full card details. The all-released-sets sync period is distinct from the former latest-set-only run, so an upgrade catches up even when that week already has a completed older run. The complete collection is atomically published in `deck_provider_snapshots`. Browsing and details read only these snapshots, never the external API, and remain available without an API key. Collection responses include a playable list for the requested game format so selecting a card requires no request. Missing snapshots return an unavailable response without fetching upstream. The last successful collection remains available if refresh fails; snapshots older than seven days are marked stale. The 15-minute upstream cache is used only by the collector. Collection is paced at 1.3 seconds per request, with a shared 50-request/minute budget, upstream cooldown, an exclusive database lock, and hourly retry after failure. Shutdown cancels the collector. Completion counts and failures are logged without credentials.

Provider UI strings are translated in English, Portuguese and Spanish; other interface languages currently use English for this feature.
