<div align="center">

# Aegis

**Play the Digimon Card Game in a browser tab. No download, no desktop client.**

[Play now](https://aegis-digi.online) &nbsp;·&nbsp; [Discord](https://discord.gg/mmj7u9btCd) &nbsp;·&nbsp; [Architecture](./docs/ARCHITECTURE.md) &nbsp;·&nbsp; [API contract](./docs/API-CONTRACT.md)

<img src="./docs/images/match.jpg" alt="An Aegis match against the AI: battle areas, memory gauge, raising areas, security and cards in hand" width="900">

</div>

> Aegis is an unofficial, non-commercial fan project. Bandai does not sponsor,
> endorse or affiliate with it.

---

## What it does

- **1v1 matches** against a live opponent, a friend by invite code, or the bot.
- **Full card pool**: 4,480 cards across 66 sets, searchable by color, type, level, trait and cost.
- **Deck builder** with legality checks, level curve, color balance, import and export.
- **Tournaments** with fixed rules, a frozen ban list and a server-owned clock.
- **Server-authoritative rules**: the API decides every legal play, so a patched client changes nothing.

## Languages

Choose your interface language in Settings. Aegis supports English, Brazilian Portuguese,
Spanish, Italian, Korean, Japanese, Simplified Chinese, Traditional Chinese, French,
German, and Indonesian. The first visit uses your browser languages; your selected
language is saved and synchronized through account preferences when signed in.

Translations ship with the app and need no translation service during gameplay.
The seven newest language dictionaries are machine translated with selected gameplay
terms corrected; native-speaker review is still needed. Simplified Chinese also
uses maintained dictionaries for card names, complete printed effects, keyword
hints and card metadata in the connected display components. Missing entries,
unmatched effect fragments and arbitrary server prose retain English. Other
locales keep their existing card display. See the [card localization guide](docs/LOCALIZATION.zh-CN.md)
for coverage and source notes. Release notes and the privacy policy fall back to
English where a published translation is unavailable.

## Screens

|                                                                Lobby                                                                |                                                        Deck builder                                                        |
| :---------------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------: |
|      <img src="./docs/images/lobby.jpg" alt="Lobby: quick match, practice vs AI, private match, and preset decks" width="440">      | <img src="./docs/images/deck-builder.jpg" alt="Deck builder with card pool filters, search and the deck list" width="440"> |
|                                                          **Card library**                                                           |                                                          **Home**                                                          |
| <img src="./docs/images/collection.jpg" alt="Card library with 4,458 cards and filters for color, type, level and set" width="440"> |     <img src="./docs/images/home.jpg" alt="Home screen: play now, build a deck, and Discord account sync" width="440">     |

## Architecture

```mermaid
flowchart LR
  subgraph browser["@aegis/web · React · Vite · PixiJS"]
    ui["Screens and board"]
    client["Colyseus client"]
  end

  shared["@aegis/shared: card data, schema, protocol"]

  subgraph api["@aegis/api · Node · Colyseus"]
    room["AegisRoom"]
    engine["GameEngine"]
    stack["Effect stack and decisions"]
    cards["4,480 card modules"]
    db[("Postgres")]
  end

  ui --> client
  client -- "intent" --> room
  room --> engine
  engine --> stack
  stack --> cards
  engine --> db
  room -- "seat-filtered state" --> client
  shared -.-> browser
  shared -.-> api
```

A turn moves through six steps:

1. A client joins an `AegisRoom` and receives a state view for its seat alone.
2. The client sends an intent: play this card, digivolve here, attack that Digimon.
3. `GameEngine` validates the actor, phase, cost, targets and pending interactions.
4. Engine actions move cards through the state-access seam and push effects onto the stack.
5. A decision pauses resolution until the owning player answers.
6. Colyseus syncs the result, hiding what the seat must not see.

The client sends choices. It never sends state, and it never rules on legality.

### Packages

| Package         | Owns                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `@aegis/api`    | Colyseus rooms, rules engine, card behavior, bots, tournaments, persistence |
| `@aegis/web`    | React and PixiJS client, deck builder, lobby, board rendering               |
| `@aegis/shared` | Card catalog, synchronized schema, protocol types, ban list                 |

Dependencies point inward. Both apps depend on `@aegis/shared`; neither app
depends on the other; game rules never cross into the client.

### Running at scale

A Colyseus process is single-threaded, so one process uses one CPU core however many the
host has. In production the API runs as three processes that share their matchmaking state
through Redis; each advertises its own public path, and the proxy sends every client to the
process holding its room. Measured on the deployment host, that turns roughly 650
concurrent matches into roughly 2,000.

Set `AEGIS_REDIS_URL` and `AEGIS_PROCESS_PATH` to turn it on. Leave them unset and the API
runs as a single process, which is what `pnpm dev` does.
[Architecture](./docs/ARCHITECTURE.md#processes) has the details.

### By the numbers

|                       |                                                            |
| --------------------- | ---------------------------------------------------------- |
| Cards in the catalog  | 4,480 across 66 sets                                       |
| Card behavior modules | 4,480 under `apps/api/src/cards/`                          |
| Test files            | 6,180                                                      |
| Rules knowledge base  | official rules, rulings, errata and ban list in `data/kb/` |

## Play in your browser

Aegis lets you play directly in a browser without installing a desktop client.

## Quick start

Requires Node.js 26 and pnpm 10.

```bash
npm install --global pnpm@10.30.1
pnpm install
pnpm dev
```

`pnpm dev` starts the shared package in watch mode, the API on port `2567`, and
the client at `http://localhost:5173`. The API builds once and does not watch: restart
`pnpm dev` to pick up API changes. The client talks to `ws://localhost:2567`
unless you set `VITE_AEGIS_API_URL`.

### Commands

```bash
pnpm dev           # run the whole development workspace
pnpm build         # build shared, API and web
pnpm typecheck     # type-check every package
pnpm test          # run package test suites
pnpm test:tools    # run repository tool tests
pnpm lint          # Oxlint
pnpm format:check  # Oxfmt
pnpm check
pnpm check:fix
pnpm run ci            # the full verification suite
```

`pnpm check` runs the non-mutating lint and format gate. `pnpm check:fix` applies
lint and format fixes; review its diff before running the final gate.

Target one package with a filter:

```bash
pnpm --filter @aegis/api dev
pnpm --filter @aegis/web dev
pnpm --filter @aegis/shared dev
```

## Repository layout

```text
.
├── apps/
│   ├── api/          # authoritative server, engine, cards, bots, tournaments
│   └── web/          # browser client
├── packages/shared/  # schema, protocol, types, card catalog
├── data/kb/          # rules, rulings, errata, ban list
├── docs/             # architecture, protocol, releases, operations
├── tools/            # validation, import, release, deployment scripts
└── docker-compose.yml
```

## Implementing a card

Each card is one TypeScript module:

```text
apps/api/src/cards/<SET>/<CARD-ID>.ts
```

The module declares a `CompiledCard` and registers it with
`registerIrCard(cardId, compiled)`. The engine's interpreter runs that
declaration. Importing `apps/api/src/cards/index.ts` registers every module at
boot. No generator sits between the card text and the code. Do not add a
`registerCard` registration for a card: it exists only for legacy
compatibility, engine tests and justified internal seams.

After you change a card module, sync and check its effect snapshot:

```bash
node tools/sync-effects-from-card-modules.mjs --set <SET>
node tools/sync-effects-from-card-modules.mjs --set <SET> --check
```

Put tests where they belong:

- Card behavior: beside the module in `apps/api/src/cards/<SET>/`.
- Game scenarios and bug regressions: `apps/api/src/engine/scenarios/<behavior>.test.ts`.
- Engine mechanisms: beside their implementation.

Tests drive public intents through `engine/testkit` and assert observable game
state. `data/kb/` supplies the official rulings and errata that decide the hard
cases. Query it with `node tools/kb/query.mjs card <CARD-ID> --json`.

## Hosting and donations

I run Aegis on my own server in Brazil, next to my other apps. The server is
already paid for and already running, so Aegis costs me nothing to host.

Aegis takes no donations. There is no sponsor button, no Patreon, no crypto
address, and no plan to add one. If someone asks you to pay for Aegis, they do
not speak for this project.

Spend the money on the official Digimon Card Game instead. If you want to help
here, open an issue, fix a card, or bring a friend to a match.

## Contributing

Pull requests are welcome. [AGENTS.md](./AGENTS.md) holds the repository
rules for card changes, rules research and tests. Before you open a PR:

1. Keep rules and state transitions in the API.
2. Add or update tests for observable behavior.
3. Run `pnpm run ci` and `git diff --check`.
4. Keep commits focused, and say what changed for players or for the rules.

`develop` is the default development branch. Create feature and fix branches from
`develop` and open their PRs against `develop`, using the default PR template.
`main` contains releases. Both long-lived branches require PRs and preserve commit
history with merge commits; do not squash, rebase, force-push, or delete them.

## Releasing

A normal release uses a PR from `develop` into `main`. Merging the PR does not
publish a GitHub release or deploy the application.

1. **Prepare.** Run `pnpm release:set X.Y.Z-beta`. Add the release to
   `apps/web/src/releases/releases.json` and its English (`en`), Portuguese (`pt-BR`),
   Spanish (`es`) and Italian (`it`) text to `messages.json`. Commit as
   `chore(release): prepare vX.Y.Z-BETA` on a branch from `develop`, then merge its
   PR into `develop`.
2. **Review.** Open a PR with base `main` and head `develop`, titled
   `Release vX.Y.Z-BETA`. Use the [release PR template](.github/PULL_REQUEST_TEMPLATE/release.md)
   by adding `?template=release.md` to the GitHub compare URL. Review the complete
   release diff, run the checks, and merge using a merge commit. Keep `develop`.
3. **Publish.** Check out `main`, run `git pull --ff-only origin main`, and from a
   clean worktree at the merged release commit run
   `pnpm release:publish -- vX.Y.Z-BETA`. It runs the release checks, pushes the tag and
   creates the GitHub release, marked as latest, with the notes from `pnpm release:notes`.

After release, synchronize `main` back into `develop` through a PR with a merge
commit. Hotfixes released from `main` must also be merged back into `develop`.

`pnpm release:notes -- vX.Y.Z-BETA` prints the notes for an older release.

## Legal

The source code ships under the MIT License. Digimon, the Digimon Card Game,
card artwork, card text and related trademarks belong to their owners and fall
outside that license.

This project is a non-commercial community effort. The MIT License places no
such limit on your use of the software. If you enjoy Aegis, support the
official Digimon Card Game.

## Credits

Card data comes from the community-maintained
[TakaOtaku/Digimon-Card-App](https://github.com/TakaOtaku/Digimon-Card-App)
database (`src/assets/cardlists/DigimonCards.json`, MIT License, © Christian
Bayer). `tools/import-taka-cards.mjs` maps those records into this project's
`CardDefinition` shape. Thanks to its maintainers and contributors.

Player portraits come from the PlayStation _Digimon World_ card sheets ripped by
**metaldodomon** and published on The Spriters Resource. `tools/extract-dw-card-avatars.py`
slices those sheets into the files under `apps/web/public/avatars/digimon-world-1/`.

Chat emote icons come from the PlayStation _Digimon World_ battle command sheet
ripped by **Romsstar** and published on The Spriters Resource.
`tools/extract-dw-command-emotes.py` slices that sheet into the files under
`apps/web/public/emotes/digimon-world-1/`.

Clean card scans without the SAMPLE watermark were provided by **Karasu Komadreja**. They
cover BT22, BT23, EX10, EX11, alternate arts, and promotion cards, and live in
`data/card-images/clean/`.

## License

[MIT](./LICENSE) © Vinícius Luiz.
