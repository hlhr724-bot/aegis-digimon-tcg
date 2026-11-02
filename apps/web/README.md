# @aegis/web

The Aegis client: **React + Vite**. It is a pure function of the synchronized
Colyseus state and sends only _intents_ — it contains no game rules (see
[`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) and
[`../../docs/API-CONTRACT.md`](../../docs/API-CONTRACT.md)). The board and every
screen are rendered as plain React DOM over the Aegis design system; there is no
canvas/Pixi layer (a spatial renderer can be reintroduced behind the same state
projection if the board ever needs per-frame effects).

## Run

```bash
# from the repo root — runs shared (watch) + api (:2567) + web (:5173)
pnpm dev

# or just the client (expects an api already running on :2567)
pnpm --filter @aegis/web dev
```

The server URL is read from `VITE_AEGIS_API_URL` (default `ws://<host>:2567`).

```bash
pnpm --filter @aegis/web build       # tsc + vite production build
pnpm --filter @aegis/web typecheck   # tsc --noEmit
```

## Layout

```
src/
├── main.tsx                 # React root
├── App.tsx                  # screen router; holds player identity + editable decks
├── design/                  # the Aegis design system (presentational, no rules)
│   ├── tokens.css           # --ds-* variables, semantic text roles, keyframes
│   ├── theme.ts             # the 7 gameplay colors + geometric sigil heraldry
│   ├── primitives.tsx       # Stage (16:9 letterbox), Button, Panel, Badge, TopNav…
│   ├── cards.tsx            # CardFull / CardMini / CardBack / Sigil over real data
│   └── icons.tsx            # the Lucide-style stroke icon set
├── screens/                 # the shell screens
│   ├── Onboarding.tsx       # handle + identity-color entry
│   ├── MainMenu.tsx         # splash launcher
│   ├── Lobby.tsx            # matchmaking: pick a deck, enter the queue
│   ├── Collection.tsx       # full card gallery (filter rail + detail drawer)
│   ├── DeckBuilder.tsx      # deck list + full 50/5 editor
│   ├── Settings.tsx         # gameplay / display / audio / account tabs
│   └── cardLibrary.tsx      # shared filter rail + detail drawer + owned counts
├── game/                    # the in-game board (a pure render of GameState)
│   ├── GameScreen.tsx       # board layout, drag/click → intent routing, sidebar
│   ├── boardPieces.tsx      # piles, permanents, breeding slot, memory gauge, hand
│   ├── overlays.tsx         # mulligan / block / security / decision / game-over
│   ├── boardModel.ts        # pure projections of GameState (no rules, no mutation)
│   └── decks.ts             # selectable starter decks + deck helpers
└── net/                     # Colyseus client, useRoom hook, typed intent wrappers
    ├── client.ts            # Client + joinOrCreate + sendIntent
    ├── useRoom.ts           # subscribe to state/events/decisions; expose sessionId
    ├── intents.ts           # typed send() wrappers around @aegis/shared protocol
    └── types.ts             # AegisJoinOptions
```

## UI review

Reviewing a match-screen styling change no longer needs a live match. The dev-only
page `/dev/board` renders every board piece and dialog from fixtures, in labeled
sections you can scroll.

- **In a browser:** start the dev server and open http://localhost:5173/dev/board.

## What renders / how to interact

The board shows **both players'** synchronized zones: battle area (Digimon with
digivolution-stack depth, current DP, suspended rotation, linked/Tamer badges),
breeding slot, hand (your own face-up, the opponent's as a count), security / deck /
egg-deck / trash piles (counts, with a trash peek), and the shared memory gauge.
Cards render their real `CardDefinition` fields (name, play/digivolve cost, DP, level,
type, effect text) under a color-coded geometric **sigil** (`design/theme.ts`); real
art is a deferred seam keyed on `CardDefinition.imageId`.

Interaction (all clicks become server-validated intents):

- **Play / digivolve** — click a hand card to select it, then click your battle area
  to play it, or one of your Digimon to digivolve onto it.
- **Attack** — with nothing selected, click your Digimon to pick the attacker, then
  click the opponent's security to attack the player, or an opponent Digimon to
  attack it.
- **Decisions** — when the server raises a prompt, clicks toggle picks (for
  target/select) and the HUD's Confirm sends the response; optional/modal/order
  prompts and the mulligan / coin-toss are answered from the HUD directly.
- The action bar covers ready, hatch egg, end phase, surrender, and the block window
  (declare / decline) when one is open.

## Card library keyword filter

The filter rail in the deck builder and the collection has a collapsible **Keywords**
group. It works like the other chip groups.

- **Source of the list:** the chips come from the keyword glossary
  (`game/keywordGlossary.ts`) and use the same printed names as the Learn rules page
  (`game/getKeywordName.ts`). The rail shows only keywords found in the current card
  pool.
- **Several chips:** a card matches when it has **any** selected keyword (OR), like
  level, cost, and rarity. Other filter groups still combine with AND.
- **Security Attack:** the filter splits it into `Security A. +` (bonuses, including
  `S Attack +1`) and `Security A. -` (penalties such as `Security Attack -1`).

`screens/findCardKeywords.ts` decides which keywords a card has. It parses each card
once and caches the result per card, so typing in the search box does not re-parse.

- **Brackets only:** a keyword counts only inside keyword brackets (`＜Blocker＞` or
  `<Blocker>`). "Can't be blocked" is not Blocker (BT1-034).
- **Text fields:** main, inherited, security, option, dual, and link effect text all
  count. Inherited text counts because the stack gives it to the Digimon on top.
  Kokuwamon (BT14-055) has Blocker only as an inherited effect.
- **Performed or granted:** `＜Draw 1＞` and `gains ＜Rush＞` count.
- **Reminder text:** text in parentheses does not count. Sheepmon's Collision
  reminder names Blocker, but Sheepmon has no Blocker (BT16-032).
- **References:** a keyword after `with`, `without`, `w/`, `has`, `have`, `had`, or
  `affected by` is a reference, not presence: "Delete 1 of your opponent's Digimon
  with ＜Blocker＞" (BT1-023). A list joined by `and`, `or`, `,`, `/`, or `&` keeps
  the first item's status.
- **Unlisted keywords:** keywords the glossary does not define, such as Arts
  Digivolve, have no chip.

## Smoke test (connect + render + intent, headless)

With an api running on `:2567`:

```bash
node apps/web/scripts/smoke-connect.mjs
# AEGIS_SMOKE_ENDPOINT=ws://127.0.0.1:2567 node apps/web/scripts/smoke-connect.mjs
```

It joins two clients to the `aegis` room, prints each client's synchronized state,
and sends a few intents. `PASS` = both joined the same room and received the state.

> Until the engine's `deck-and-setup` / turn loop land (server side), zones are empty
> (counts 0), phase is `None`, and turn verbs come back as `not-implemented` /
> `wrong-phase` — the connect, per-seat state sync, and intent round trip all work and
> are surfaced in the in-app event log. The board will populate with real cards as
> soon as the server starts dealing them; no client change is needed.
