# Aegis architecture

Aegis is a server-authoritative Digimon Card Game simulator. The API owns game
state and rules; the web client renders synchronized state and sends typed
intents.

## Workspace

- `packages/shared`: card data, schema classes, enums, protocol types, and
  runtime effect records shared by server and client.
- `apps/api`: Colyseus rooms, rules engine, persistence, tournaments, bots, and
  TypeScript card modules.
- `apps/web`: React application and game presentation.
- `data/kb`: official rules, rulings, errata, and banlist data.
- `tools`: current card-data, knowledge-base, release, and deployment utilities.

Dependencies point inward through `@aegis/shared`: the shared package does not
depend on either application, and the web application does not own game rules.

## Runtime flow

1. A client joins an `AegisRoom` and receives a seat-specific state view.
2. The client sends an intent describing the requested action.
3. `GameEngine` validates the intent against the authoritative state.
4. Engine actions update zones through the state-access layer and resolve
   effects through the effect stack.
5. Decisions pause effect resolution until the owning player responds.
6. Colyseus synchronizes the resulting state and the server emits presentation
   events where appropriate.
7. Every event carries `seq`, its `batch`, and the `stateVersion` it was emitted
   under, and the room closes each batch with a `batchClosed` event. The server
   never waits for the client: the client paces its own presentation from that
   stream, drawing the board from the snapshot of the batch it has reached while
   reading the live state for legality.

The client never sends state replacements or decides whether an action is
legal.

Match history uses movement identities only when the server publishes them or a
public movement already identifies the card. Private deck and hand transfers
cannot recover names from a cached identity index. Deck-return events with
`deckReturnOrder: true` list `instanceIds`, `cardIds`, and artwork in final
top-to-bottom order within each movement group. The legacy `to: deck` means a
return to the top; `to: deckBottom` means the bottom. The log explicitly names
that destination and order. Face-down digivolution and linked cards remain
unnamed when returned to a hidden deck.

Field references display the authoritative permanent identifier (`perm-18` as
`#18`) and remain stable across layout changes and digivolution. Grouped copies
list their member references. Grouping identical Tamers is a presentation
preference, enabled by default and persisted locally and in account preferences.
Declined optional effects open no public activation lifecycle; accepted effects
that produce no state change still close with a resolution event.

Two replay records exist and serve different purposes. The player replay
(`apps/api/src/replays/recording.ts`) stores snapshot frames for playback. The
input record (`apps/api/src/replays/inputs/`, format `aegis-replay-inputs/1`)
stores the decklists and every input so the engine can re-execute the match.
New matches also record a server-generated 256-bit `randomKey` for keyed shuffles
and opaque initial card identities. This key stays in server hooks, logs, and
private input records; it never enters synchronized state or player replay frames.
Records without the key retain the legacy setup algorithm for reproduction.
Live rooms ignore client seeds outside the test runtime. Feedback input records
are available only through administrator routes or database tooling, including
when the report is mirrored to GitHub.
`pnpm replay run <record> --export <file>.aegis-replay` re-executes an input
record into a player replay through the same `ReplayRecording`, so the web
viewer opens it.

## Cards and effects

Every supported card has a module under `apps/api/src/cards/<SET>/<ID>.ts`.
Importing `apps/api/src/cards/index.ts` registers those modules at boot.

Each module declares a `CompiledCard` and registers it with
`registerIrCard(cardId, compiled)`. The interpreter in
`apps/api/src/engine/effects/interpreter/` runs that declaration; the IR types
live in `packages/shared/src/effects/ir/`. The card module is the authoring
source: no generator creates card behavior.

`registerCard` takes a hand-written `EffectModule`. It remains only for legacy
compatibility, engine tests, and justified internal seams. A card must not have
both registrations.

The committed `packages/shared/src/effects/effects.json` is runtime data for
shared card requirements and client/server lookups. It is a generated snapshot,
not an authoring source. After you change a card module, sync and check its set:

```bash
node tools/sync-effects-from-card-modules.mjs --set <SET>
node tools/sync-effects-from-card-modules.mjs --set <SET> --check
```

`--check` fails when the set's records are stale or its keys differ from the
card catalog. Add `--base <GIT-REF>` to compare against that ref and reject
semantic or byte changes outside the set. Without `--check`, `--base` also
restores the ref's bytes for every other set, and refuses if any of them differ
in meaning.

## State and effects

`GameState` contains the turn cursor, memory gauge, players, public game status,
and pending interaction state. Each `PlayerState` owns its zones. A `Permanent`
contains a top card, digivolution stack, linked cards, controller, DP, and
position flags.

The effect stack collects effects for a timing window, orders simultaneous
effects, resolves them one at a time, and opens typed decisions when player
input is required. Continuous effects are recomputed from active sources rather
than stored as permanent mutations.

### Trigger sequencing

One game event produces one pool of triggers, resolved by a single loop:

1. **Collect.** The pool holds the printed effects that trigger at the window's
   timing plus the armed SubTrigger watchers for the same event, which the event
   seam hands over through `withPendingSubTriggers`. Watchers are snapshotted
   when the event happens; the pool is re-derived every pass, so a trigger whose
   condition lapses drops out (CR §15-4-4-5).
2. **Order.** Turn player's triggers first, then the opponent's. Within one
   controller's group the controller chooses the next one to resolve — printed
   effects and watchers compete in the same prompt.
3. **Resolve one**, then run the rule sweep (state-based actions) and settle the
   deferred queues. A trigger derived from the effect that just resolved
   therefore activates before the triggers that were already pending
   (CR §15-4-5-2/3).

Step 3 is why a window never parks a deferred deletion or security-removal
reaction until it closes: it drains them between effects, at the only point
where no card body is on the stack. A nested (cut-in) resolution opened from
inside a card body neither settles those queues nor reaches into the pool.

Whatever the windows did not resolve fires afterwards on the SubTrigger bus,
which skips the watchers the window already consumed. Consumption is tracked by
a stable `(event, anchor, description)` identity, because a continuous recompute
re-installs every continuous watcher under a fresh subscription id.

## Persistence

Database schema upgrades live in `apps/api/src/db/migrations`; they are active
runtime migrations and must remain sequential.

The synchronized `GameState` is not a durable match snapshot. A Colyseus room and its
in-memory engine continuations belong to one process. Reconnect tokens resume a seat
while that owner stays available. Production deploys use fixed blue, red, and green
slots; older slots remain routable until their rooms and clients drain, then verified
cleanup removes them.

## Processes

A Colyseus process is single-threaded, so one process uses one CPU core no matter how
many the host has. The API therefore runs as several processes that share their
matchmaking state, and each one advertises the public path where clients reach it.

| Variable                          | Meaning                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `AEGIS_REDIS_URL`                 | Shared matchmaking state. Unset means single-process: local presence, local driver, no public address.                                       |
| `AEGIS_PROCESS_PATH`              | This process's unique path segment (`p1`, `p2`, …). Required whenever `AEGIS_REDIS_URL` is set.                                              |
| `AEGIS_PUBLIC_HOST`               | Host clients connect to; falls back to `AEGIS_API_URL`. Combined with the path into the address Colyseus returns with each seat reservation. |
| `AEGIS_LOG_DIR`                   | JSONL log directory. Production mounts the persistent rollout directory at `/logs`. Replay lines also go to `replays/<matchId>.jsonl`.       |
| `AEGIS_LOG_MAX_BYTES`             | Maximum bytes per JSONL segment before rotation. Production uses 256 MiB. Segments and match replay logs go 12 hours after their last write. |
| `AEGIS_REPLAY_CAPTURE_ENABLED`    | `false` stops saving a match replay with bug reports filed from a match.                                                                     |
| `AEGIS_REPLAY_CAPTURE_TIMEOUT_MS` | Time budget for reading a reported match's replay log (default 3000).                                                                        |
| `AEGIS_REPLAY_RETENTION_DAYS`     | Days a saved replay is kept (default 30).                                                                                                    |
| `AEGIS_REPLAY_MAX_CHARS`          | Largest serialized replay kept with a report (default 2000000).                                                                              |
| `AEGIS_STRICT_EFFECTS`            | `1` makes unsupported card effects throw, `0` makes them log and continue. Unset: throw unless `NODE_ENV=production`.                        |

Two consequences follow from rooms living on one process each:

- The edge proxy must route each `/pN` path to that process and nowhere else. A seat
  reservation is worthless on a sibling. `docker/Caddyfile` does this.
- State the HTTP endpoints read cannot be process-local. Private room codes live in the
  shared presence, `/bot/join` reaches the owning process through `remoteRoomCall`, and a
  drain is published to every process of the slot.

Each slot runs its own Redis, which is what keeps a draining slot and the active one from
seeing each other's rooms: Colyseus's own matchmaking keys are fixed names, so a shared Redis
would merge the two slots' room listings. `AEGIS_REDIS_URL` therefore points at the slot's own
instance, and the slot-scoped prefix applies only to the keys Aegis writes itself.

## Bot attack evaluation

The engine derives server-only `Permanent.attackRedirectTargets` for each legal
attack target from installed opponent-attack watchers. The bot consumes these
projections alongside Blocker when scoring battles and lethal sequences. Inherited
sources, target filters, payable public costs, and spent once-per-turn budgets use
the same live effect context as resolution. Distinct targets of one watcher share
its interception budget; self-suspension costs share the source permanent’s budget. The projection is neither synchronized nor persisted.

Hidden hand costs are estimated from public hand size, never card identities.
This is a tactical estimate: it does not simulate preceding actions that create or
bind a new redirect target, and treats repeatable watchers without an explicit
one-use budget conservatively. Card resolution remains authoritative.

The `bot-attack-redirection` scenario covers the regression reported in
[issue #5601](https://github.com/vinicius3333/aegis-digimon-tcg/issues/5601), including
Negamon's inherited effect, Tamer costs, consumed limits, and player-only redirects.

## Verification

```bash
pnpm typecheck
pnpm test:tools
pnpm test
```

Card behavior tests live beside their module and assert observable state.
Scenario and bug-regression tests live in `apps/api/src/engine/scenarios/` and
drive public intents through `engine/testkit`. Engine conformance tests cover
shared rules and cite the KB. Browser specs in `apps/web/e2e/` exercise rendered
flows through a real room. [AGENTS.md](../AGENTS.md) has the full test rules.
Reusable regression boards use behavior-named fixtures shared by the testkit and
browser harness. Manual reproductions load those fixtures on demand rather than
requiring arena registrations; see [regression fixtures](TESTING.md).

## Manual tables

Rooms `aegis_manual` and `aegis_manual_private` select the immutable manual mode.
They share the card catalog, deck validation, setup, Colyseus state views and arena
with automatic games. Public matchmaking separates mode, format and banlist;
private invitations resolve the host's mode before joining. Older records without
`gameMode` continue to use automatic execution.

`GameEngine` remains the room-facing lifecycle facade. In manual mode it delegates
board commands to `ManualController` instead of the automatic intent router.
Setup chooses a player to decide the first seat, deals hands, offers mulligans and
sets security. Each turn then unsuspends the active player's cards, draws one card
except on the first turn of the game, and offers the legal breeding choice before
Main. Hatching, moving out and skipping are mutually exclusive choices owned by
the active player. If neither hatch nor move is available, the turn enters Main
automatically. A mandatory start-of-turn draw from an empty deck ends the game.
Card effects, continuous rules, memory-based turn passing and other victory checks
remain manual. Each player can make explicit corrections to their own side.
Passing changes the active seat and reverses the relative memory sign, preserving
the gauge's physical position, then prepares the next turn.

Manual commands are validated and applied by the API. Each command carries a
request identifier and a manual revision, preventing duplicates and stale edits.
Inspection projections are owner-private; the actual deck and security identities
remain hidden in ordinary state views. Explicit revelations are public. Moving a
card back to a hidden zone restores its hidden facing. Player replay recordings
remove inspection projections, while administrator input records retain the
commands and server randomness needed for deterministic reproduction.

Undo restores one server-owned checkpoint only after the other player accepts.
The operation history remains visible, including consultations and revelations;
undo cannot remove information a player has seen. Result proposals also require
the other player to accept. Concession follows the existing room lifecycle.
Manual games use single-game casual rooms, have no competitive clock or bots,
and do not write competitive results or recent-match history. Their downloadable
player replays are identified as manual.

Manual card controls support independent visual statuses, DP, Security Attack,
keyword and color overrides, free-text markers, source and link ordering, tokens,
and atomic Training placement. Resetting modifiers preserves suspension. Public
reveals retain their owning seat and original zone so their owner can move a
revealed card without opening a private inspection. Moving or shuffling cards
invalidates stale public references. Face-down field cards retain their card-back
interaction targets and cannot declare attacks or effect signals.

Effect signals explicitly publish an owned hand or face-up field card and an
optional card or player target. Signals provide shared visual context and do not
execute effects. Guided phase preparation does not execute printed effects such
as Reboot or draw bonuses. Manual combat tracking never resolves battles or
security checks. Pending undo, result and restart agreements block table edits.
A restart requires the other player's approval, preserves the original decks and
player seats, uses fresh deterministic randomness, and repeats mulligans and
security setup with the agreed first player. Restart invalidates the previous undo
checkpoint, inspections, reveals, signals and combat tracking.
