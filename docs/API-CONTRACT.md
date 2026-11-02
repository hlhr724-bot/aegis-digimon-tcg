# Aegis API contract

The canonical wire types live in `packages/shared/src/protocol` and the
synchronized schema lives in `packages/shared/src/schema`. This document
describes their boundaries; source code remains authoritative for exact fields.

## Room

The API exposes the Colyseus room type `aegis`, implemented by `AegisRoom`.
Clients join with their authenticated context and selected deck. The server
assigns seats, validates the deck, creates the game, and publishes a
seat-filtered view.

The lobby's Beta battle mode checkbox selects the separate `aegis_beta` public
queue and sends `betaBattleMode: true` from each seat. This room type is always
registered, including in production; it permits preview cards such as EX13 and
upcoming promos. Beta matches are unranked. Both seats must explicitly opt in.
Normal, ranked, private, and tournament rooms reject beta opt-in and retain their
normal deck eligibility. Bot matches use one `aegis_bot` room type. Like a
private room, it accepts preview cards without a beta opt-in, because it has
one human seat and no public queue. The bot's own preset or random deck never
contains preview cards; a custom bot deck the player picks may. Handler-owned
beta settings cannot be overridden by client creation options. The legacy
`aegis_beta_bot` wire name remains registered as an alias with the same bot rules
so already-loaded clients can start practice matches during the rollout.

Collection and deck-builder visibility is independent of battle eligibility:
all deckable catalog entries remain visible, including preview cards. A deck
containing beta-only cards needs the checkbox in Quick Match before launch.

## Match chat

The `chat` message transport carries two isolated conversations. The API derives
membership from the authenticated room role: seated players receive only player
messages, and spectators receive only spectator messages. Both text and emotes
follow this rule. Unseated clients receive neither conversation, and payloads
cannot select a different sender role or audience. Existing moderation and
per-sender cooldowns apply within each conversation.

## Live match list

`GET /spectate/live?offset=0&limit=10` returns a `LiveMatchPage`:
`{ matches: LiveMatch[], total: number }`. Both types live in
`packages/shared/src/protocol/LiveMatch.ts`. Each entry holds the spectator
code, both display names, the deck format, the start time in epoch
milliseconds, and the current spectator count.

- Matches are sorted by spectator count, then by newest start.
- `offset` is 0 to 10000 and defaults to 0. `limit` is 1 to 50 and defaults
  to 10. Other values return 400.
- `total` counts every listed match in this slot, not only the page.
- Each API process caches the full list for 5 seconds and shares one room
  query between concurrent requests, so the cost does not grow with the number
  of viewers. A failed query is not cached and returns 503.

A match is listed only when all of these are true:

- It is a casual room: `aegis`, `aegis_unlimited` or `aegis_beta`. Private,
  ranked, bot and tournament rooms are never listed.
- Both seats belong to accounts whose preferences hold `listLiveMatches: true`.
  A guest seat keeps the match unlisted.
- The match has started, has not ended, and has fewer than 20 spectators.

The room publishes the entry in its matchmaking metadata as `live`, and updates
it when spectators join or leave. Each deployment slot answers only for its own
rooms, so the web client asks each active and draining slot for its first
`limit` matches, merges and sorts them, and keeps `limit`. "Show more" raises
`limit` by one page, up to 50, instead of sending an `offset`, because offsets
cannot be merged correctly across slots.
Watching a listed match still goes through `POST /spectate/join` with the
spectator code, which rechecks admission on the room's own process.

## Tournament spectating

Tournament rooms are never listed and have no spectator code. The organizer
sets a spectator policy on each tournament:

| Policy      | Who can watch                                  |
| ----------- | ---------------------------------------------- |
| `nobody`    | The organizer and site admins (default)        |
| `allowlist` | The organizer, site admins and listed accounts |
| `signed_in` | Any signed-in account                          |

Every policy refuses an account that is still in the event (`registered`,
`checked_in` or `active`), so a player cannot scout another table. Spectators
get the same public view as casual spectators: hands stay hidden.

Organizer and admin routes (signed in, `organizer_required` otherwise) return a
`TournamentSpectatorSettings`:

- `GET /tournaments/:id/spectators`
- `PUT /tournaments/:id/spectators/policy` with `{ policy }`
- `POST /tournaments/:id/spectators` with `{ displayName }`. An unknown name
  returns `404 spectator_account_not_found`; more than 50 entries returns
  `409 spectator_limit_reached`.
- `DELETE /tournaments/:id/spectators/:accountId`

`GET /tournaments/:id` adds `spectatorPolicy` and `canSpectate` for the
current viewer. To watch, the client posts
`{ tournamentId, matchId, authTicket }` to `POST /spectate/tournament` on each
active and draining slot. The slot that hosts the game's `playing` room
consumes the ticket, checks the policy, and reserves a spectator seat with a
fresh room ticket. The room consumes that ticket and checks the policy again
before it admits the socket, so a forged join cannot skip the check. A slot
without the room answers `404 match_not_live`.

## Optional rollback

`allowRollback` defaults to `false`. Casual random queues, including Beta and
Unlimited, filter on the explicit boolean so both players choose the same rule.
Private hosts and bot-room creators choose it for their room; casual series keep
it for subsequent games. Ranked and tournament handlers refuse rollback even
when a client forges the option or request.

On the `rollback` channel, a seated client sends `{ type: "request", kind:
"action" | "turn", revision }`. A human opponent must answer `{ type:
"respond", requestId, accept, revision }`; the requester may send `cancel` with
the request ID and revision. Bots accept immediately. Normal play is blocked
while consent or reconstruction is pending. Disconnects and room-issued engine
inputs invalidate pending consent. Finished games are final before result
persistence; they cannot be reopened and rewards cannot be granted twice.

Action rollback restores the point before the last accepted gameplay intent,
including effect and combat answers. Only the player who submitted that intent
may request its rollback; an older own action cannot be selected across an
opponent action. Turn rollback restores the current turn
before start effects, unsuspending, and drawing; if no gameplay action has been
accepted since that start, it restores the previous turn start. A turn rollback
is available only when every accepted gameplay intent it removes belongs to
the requester. The synchronized `undoActionSeat` and `rollbackTurnSeat` identify
the eligible player, or `-1` when unavailable; the API enforces this independently
of the button state. The API rebuilds
a fresh engine from its seed, decks, fixture when applicable, and exact input
prefix. Replay divergence or a mismatch against the captured private-state
fingerprint refuses the restoration. This rebuild recreates private zones, RNG
streams, effect continuations, decisions, modifiers, and turn/use bookkeeping.
Real elapsed match-clock time is not refunded.

Successful restoration increments `rollbackRevision`. Gameplay intents and
presentation reports carry that revision, so obsolete work is rejected. The API
retires the previous engine and bot jobs, recreates visibility views, and sends
`rollbackReset` before a full state snapshot. The client resets its schema
decoder, queued intents, decisions, snapshots, and animation session. Recorded
input replays retain the valid active prefix and normalize subsequent batch
versions; participant replay frames also retain the visible rollback moment.

## Community text moderation

The API checks published deck names on publication and republication, and checks
guides on each guide update. Rejections use `name_not_allowed` or
`guide_not_allowed` with HTTP 422. Private saved names and chat keep their existing
behavior; existing publications are not rescanned automatically.

`hasBlockedCommunityText` uses the `@2toad/profanity` engine with its English
preset and the multilingual dictionaries from
[`naughty-words`](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)
(Shutterstock, CC-BY-4.0). The other translated presets from `@2toad/profanity`
are not enabled because they include benign phrases such as Portuguese “boa sorte”.
The ambiguous Korean dictionary entry “보지” is excluded because it also appears
in ordinary auxiliary-verb constructions in strategy explanations.
The existing `obscenity` filter still detects disguised profanity. Additional
policy terms reject death-related names such as “Muerte a la Royal Base”.

Normalization handles compatibility characters, invisible formatting characters,
and Latin accents. Complete official card names that collide with the filter are
exempted only within their matched spans, so a guide can discuss Death Claw without
allowing a separate offensive phrase. A small set of explicit abusive
and death-related phrases in Chinese, Japanese, and Korean also match inside
unspaced text; broad dictionary terms keep word boundaries to limit false positives. Dictionary coverage is finite:
it does not guarantee every language, inflection, obfuscation, or contextual insult.

## Random community decks and used decks

`GET /community/decks/random?format=<DeckFormat>&beta=<true|false>` is public and
returns `CommunityRandomResult`: one full deck or `null`, plus `eligibleCount`.
The server scans every public publication in batches of 128 within a repeatable-read
transaction, revalidates legality for the requested format and beta eligibility,
and uses reservoir sampling. Hidden and unpublished decks never participate.
Memory stays bounded and the browser receives only one list. Requests have a rate
limit and at most two concurrent scans per API process; SQL statements have a
five-second timeout and the scan checks a ten-second deadline between batches.
A failed scan returns an error instead of a partial pool.

The lobby's All mystery pool combines personal, famous and community decks. The
community candidate is selected with probability `eligibleCount / totalCount`,
so each eligible deck has the same chance. Mine and Famous stay local. A pending
selection disables launch; leaving the lobby or changing its rules cancels the
pending launch.

A seated client requests `usedDeck` after joining or reconnecting. The room answers
only that client's frozen initial `UsedDeck`, including card order, artwork,
name, format and optional community attribution. It never fetches the publication
again. Casual series continuations restore the first game's deck and attribution
from the series record. Spectators cannot request another seat's deck. The
post-duel viewer copies this snapshot through the ordinary personal-deck save
workflow; source edits, unpublishing and moderation cannot change that copy.

## Optional match timer

Casual (`aegis` and `aegis_beta`) join options include `matchTimer: boolean`.
Both queues filter on this option, so timed and untimed players cannot meet.
Omitting the option leaves the timer off. Public clocks start with 300 seconds
per player. Unused time carries over between turns. Each later turn start adds
60 seconds to the turn owner and 30 seconds to the opponent, with both reserves
capped at the starting time. The opening turn uses the initial reserve without a bonus.

The mulligan has its own clock. Each player gets 30 seconds
(`MULLIGAN_TIMER_SECONDS`) to answer their own mulligan, published as
`mulliganTimerRemaining0` and `mulliganTimerRemaining1`. It never draws on the
match clock. When it runs out, the server keeps the hand (as if the player sent
`mulligan { keep: true }`). While a player's mulligan is open, the client shows
that player's mulligan seconds, labelled "Mulligan", where the match clock usually is.

Combo time: each decision the engine asks of a player (trigger order, targets,
selections, optional "activate?" choices; every `DecisionRequest` except the
mulligan), confirmed card play and confirmed digivolution adds 3 seconds
(`MATCH_TIMER_DECISION_BONUS_SECONDS`) to that player's match clock. These actions
share a limit of 30 seconds per player per turn
(`MATCH_TIMER_DECISION_BONUS_MAX_SECONDS_PER_TURN`). Rejected actions, attacks
and ending the turn add nothing. Combo time never raises a reserve above its
starting value. All
timer constants live in `packages/shared/src/matchTimer.ts`.

Private-room creators may also choose `timerStartSeconds` (60, 180, 300, 600).
Invalid values use the defaults; private reserves are capped at their chosen starting time.
`timerRefillSeconds` remains in the wire contract for compatibility, but join payloads
cannot override the fixed 60-second owner bonus; the opponent bonus is always 30 seconds.
The synchronized `timerRefillSeconds` field reports 60, and the settings do not offer a refill control.
The lobby uses a labelled on/off switch and a compact strip showing the starting time and both turn bonuses.
Private hosts can change the starting time; its displayed value and cap update together.
The on/off preference is saved under `aegis:match-timer` in browser localStorage
and restored on reload for guests and signed-in users. It is local to that browser;
joining a private room or entering a mode without timers does not overwrite it.
The creator's settings apply to both seats; guest join payloads cannot change them.
Ranked, tournament and ordinary bot rooms ignore clock opt-in. Outside production,
`pnpm scenario open match-timer` enables a live bot test with the same
300-second reserves renewed each turn. Both clocks remain visible next to their player identities, including during pauses.
The required responder is highlighted; the compact readout shows remaining seconds without status text.

The server owns elapsed time. `timerRemaining0` and `timerRemaining1` are rounded-up
seconds; `timerActiveSeat` is 0 or 1 while that player must act, and -1 while paused.
Decisions and combat responses charge their owner even during the opponent's turn.
Automatic engine resolution pauses both banks.
A match timer never skips animations. Instead, the server holds each seat's clock
while that seat's screen plays what was broadcast. The client reports nothing about
its playback:

- Each seat has a presentation timeline. When a batch closes at time `t`, the
  server sets `presentEnd[seat] = max(presentEnd[seat], t) + duration`, where
  `duration` sums each event's length at that seat's Effect speed. A seat asked to
  act is charged from `max(now, presentEnd[seat])`. Only the seat that must act is
  charged.
- Event lengths come from the table the web client animates to
  (`packages/shared/src/protocol/animationTimings.ts` and `animationPause.ts`).
  Effect beats scale with the speed (Slow 1.4x, Fast 0.55x); an opponent's played
  or digivolved card adds the Slow showcase hold (2 s).
- The client sends `animationSpeed { speed: "slow" | "normal" | "fast" }` on join
  and whenever the player changes it. A seat that never sends it counts as Normal.
  Unknown values and spectator messages are ignored. The skip control changes
  nothing on the server.
- A timeline may run at most 60 s ahead of now, so a client that queues actions far
  faster than they can be watched cannot bank unlimited time.
- A reconnecting client catches up without replaying, so its timeline ends at the
  reconnect.

A disconnect or reconnect never resets either reserve. While a player is
disconnected, the opponent's clock never runs: if the opponent must act, their
clock (match or mulligan) freezes until the player reconnects or the reconnect
grace ends in a forfeit. An absent player's own required response keeps
consuming that player's time once its pause ends. Waiting rooms do not consume time.
A player's clock never runs before that player has a decision of their own: the
opponent's end of turn and the automatic unsuspend, draw and breeding-entry steps
charge nobody, and the new turn's clock starts after its animations.
Expiry is checked before accepting an intent and ends the match through the ordinary
`gameOver` pipeline with `reason: "timeout"`, cancelling open decision/phase waits.
Clock-only schema patches do not advance the gameplay `stateVersion`.

## Player portrait

Join options may carry `avatarId`, a Digimon World portrait id from
`DIGIMON_WORLD_AVATARS`. The server copies it to `PlayerState.avatarId` so both
seats can show it beside the name. Unknown ids become `""`, as do bot seats.
The portrait is cosmetic and never affects matchmaking or rules.

## Deck artwork

Join decklists and saved account decks retain canonical `mainDeck` and `eggDeck`
card ID arrays. Optional `mainDeckArts` and `eggDeckArts` contain printing IDs
aligned by physical copy with those arrays. Supplied account-write arrays must
contain strings and match the corresponding deck length. Missing, unknown, or
foreign printing IDs resolve to the original art. Artwork does not affect deck
legality or executable rules. Tournament deck snapshots freeze these choices.

The engine assigns `CardInstance.artId` before shuffling. It moves with the
physical instance and shares `cardId`'s visibility tag, so concealed cards do
not disclose their printing. Public presentation events may include artwork IDs
for the identities they already reveal.

## Intents

Clients request actions with the discriminated intent union exported by
`@aegis/shared`. Major families include:

- game setup and mulligan responses;
- play, digivolve, use-option, link, and attack actions;
- turn and phase progression;
- effect decisions and combat responses;
- surrender and room lifecycle actions.

An intent expresses a choice, never a state mutation. The engine validates the
actor, phase, source, targets, costs, and pending-interaction ownership before
changing state.

A `digivolve` intent with `appFusionLinkedInstanceId` explicitly declares App
Fusion using that linked partner. The result must be in the acting player's hand
and the base must be their battle-area Digimon. The server checks the pair
against the result's recipe, applies digivolution costs, and moves the partner
above the former top card in the evolution stack. Omitting the field retains
ordinary evolution; it does not automatically choose App Fusion.

## Synchronized state

The shared schema exposes:

- `GameState`: match status, active seat, phase, memory, players, winner, and
  pending interaction metadata;
- `PlayerState`: deck, hand, trash, security, breeding area, egg deck, battle
  area, and player flags;
- `Permanent`: controller, top card, digivolution cards, linked cards, DP, and
  suspension/breeding state;
- `CardInstance`: stable instance id, canonical card id, cosmetic art id, owner,
  and visibility metadata.

Private zones are filtered per seat. The server must not expose hidden card
identities through schema fields, decisions, events, or error messages.

## Decisions and combat responses

Effects that need player input create a typed pending decision with a stable id
and owning seat. The answer must reference that id and satisfy its constraints.
Only one decision resolves at a time.

A decision sent on the decision channel also carries `stateVersion`: the state
revision the board will be at when the question is asked, which is the revision
the batch that raised it closes with. The client uses it as a presentation
barrier — it catches its narration up to that revision, within a bounded wait,
before showing the prompt — and never as a rule.

Combat windows use dedicated response intents for mechanics such as blocking,
Alliance, Evade, and Barrier. These are distinct from general effect decisions
because they belong to the attack sequence.

The synchronized `pendingDecision` and `combatWindow` mirror live room state. The
decision manager and combat controller also hold in-memory promises, validation
state and execution position. A reconnect token resumes a seat only while its
owning room process remains available. A socket can die without closing, for
example after a phone suspends the tab. The client pings the room every 4 s while
the tab is visible, and again when the tab becomes visible or the browser comes
back online. If no answer arrives within 10 s, the client closes the socket and
resumes its seat with the reconnect token. Production deployments route new rooms to
the active blue, red, or green slot and retain older slots until their rooms drain.

A dropped seat stays reserved for `RECONNECT_GRACE_SECONDS` (60 s). The room owns that
deadline itself, not Colyseus. A reconnect takes two steps: an HTTP request that reserves
the seat, then the socket. When the room accepts the request with less than 15 s left
(Colyseus's seat reservation time), it extends the deadline to 15 s from that moment, so
the socket still finds its seat. If the socket never arrives, the seat expires at the
extended deadline. An early request never shortens the deadline.

Each successful reconnect issues a new token in `JOIN_ROOM`. If the socket drops again
before the client acknowledges `JOIN_ROOM`, the client may never have received that
token. Colyseus refuses to hold a seat that never acknowledged its join, so the room
clears that flag and holds the seat anyway, for both the new token and the token the
client held before that reconnect. This relies on two Colyseus internals
(`_enqueuedMessages` and `_reconnections`); `apps/web/test/reconnectHandshakeDrop.connection.test.ts`
exercises it against a real server, so an upgrade that changes them fails that test.

The client saves its reconnect token per tab and stamps it every 5 s while connected.
Mobile browsers freeze those timers in the background while the socket itself stays alive,
so the stamp can be minutes old when the server finally detects the drop and starts the
grace. After a reload of the game page, the client therefore tries any saved token up to
`RECONNECT_SESSION_MAX_AGE_MS` (2 h) old and lets the server decide: a seat that no longer
exists answers at once (`410`, `522`, or `524`). Retries after a reload run for the grace
period from the page load, not from the stale stamp.

## Events and errors

State synchronization carries durable game state. Ephemeral presentation events
may describe animations, reveals, logs, or notifications, but clients cannot
depend on them as the sole record of game state.

Every event on the event channel carries a sequencing envelope
(`SequencedServerEvent`): `seq`, monotonic per room and gap-free; `batch`, the id
of the batch the event belongs to; and `stateVersion`, the state revision the
event was emitted under. One batch is everything a single entry into the engine
produced — an intent, a decision answer, a bot action, the match start. The room
ends each batch with a `batchClosed` event, sent after the state patch carrying
that batch's mutations, and `GameState.stateVersion` names that revision. The
client groups its presentation by batch instead of by arrival time.

A security check opens with exactly one `securityRevealed` and closes with
exactly one `securityChecked` for the card it checked. `securityChecked` carries
the outcome and is emitted as soon as that outcome is settled. When the security
battle deletes the attacker, the order is: `cardsMoved` with the attacker in
`deletedPermanents`, then `securityChecked` with `battle.attackerDeleted`
reflecting the field after that movement, then the deleted attacker's
[On Deletion] reactions (`effectTriggered`, any decision it requests, and
`effectResolved`). When a keyword such as Jamming spares the attacker, or when
neither side loses, `securityChecked` follows the DP compare directly.

The check can therefore still request decisions after `securityChecked` closes
it. `effectTriggered` keeps its `duringSecurityCheck` flag for effects that fire
inside the check, including those reactions.

Rejected intents return a stable failure result and leave authoritative state
unchanged. Unsupported card behavior fails loudly on the server and is covered
by engine tests.

## Compatibility

Protocol changes must remain compatible with the currently deployed web client
or ship with the controlled reload/versioning policy. Persistence compatibility
is handled separately by the numbered database migrations.

## Community deck guides

`PUT /community/decks/:id/guide` requires a session and the owner of the public deck ID. Body: `{ "guide": "text" }` or `{ "guide": null }`. Returns `200 { "guide": "normalized text" }`; null or blank clears the guide. Normalization applies NFKC, Unix newlines, trailing whitespace removal, at most one blank line, and trimming. The 5,000-character limit applies after normalization and rejects rather than truncates content.

Errors: `400 invalid_guide`, `404 deck_not_found` (including another owner's or hidden deck), `422 guide_too_long`, `422 guide_not_allowed`, and `429 too_many_requests`. Guests receive 401. Guide edits share the publication rate limit. Saving changes no deck contents, publication timestamps, or `outdated` state. Republishing preserves the guide. Administrators can read hidden guides through the existing deck endpoint, but cannot edit them through this endpoint.

Deck detail and random-deck responses contain `guide: string | null`; browse summaries contain only `hasGuide: boolean`. Search does not index guides.

The client provides a rich text editor with headings, bold, and flat bullet lists, stored as a small text format: `## ` headings, `- ` bullets, `**bold**`, and blank-line paragraphs. Backslash escapes preserve literal backslashes, asterisks, hashes, and hyphens. No HTML is evaluated. Uppercase card codes are confirmed against the catalog; unknown codes remain text. Card suggestions include code and name. Rendered card links preview artwork on hover and open `/collection?q=<card-code>` with the collection search populated.
