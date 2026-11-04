# Deck simulation

The deck editor helps players test a deck before they play it. This page describes
what each tool computes, where the work runs, and its limits.

## Draw odds

The **Draw odds** panel sits under the deck statistics in the editor. The player picks
up to four key cards. For each one, the panel shows the chance to have seen at least
one copy in the opening hand and by the start of each of the player's turns 1 to 6.

| Row             | Meaning                                              |
| --------------- | ---------------------------------------------------- |
| One key card    | At least one copy of that card                       |
| All key cards   | At least one copy of every key card at the same time |
| Level 3 Digimon | At least one Level 3 Digimon, the usual first play   |

The numbers are exact, not sampled, so they update instantly while the player edits
counts. Below the table, each key card shows its chance at the selected turn now and
with one more copy in place of another card. Selecting a turn header moves that
comparison. A copy limit hides the comparison.

### Rules the calculation follows

- The opening hand has 5 cards (`OPENING_HAND_SIZE`).
- The next 5 cards become security (`SECURITY_STACK_SIZE`) and are never seen.
- The player going first skips the draw on turn 1. The player going second draws on
  every turn, including turn 1.
- With **Mulligan a hand that misses** on, an opening hand that has none of the row's
  cards is shuffled back and redrawn once. The second hand is always kept.
- The deck size is the current main deck count. A deck under 10 cards shows no table.

Security is placed after the opening hand, so the cards seen by a turn are a uniformly
random subset of the deck. The chance to miss a card with `c` copies after seeing `n`
of `N` cards is `C(N − c, n) / C(N, n)`. Combos use inclusion and exclusion over the
key cards. The mulligan case enumerates every opening hand composition and adds the
draws after it. A shuffled-deck simulation in the shared tests agrees within one
percentage point.

The two hand constants live in `packages/shared/src/rules/`, and the engine setup imports
them, so the panel and the engine cannot drift apart. The calculation is in
`packages/shared/src/decks/goldfish/`. The panel only presents its results, and
`apps/web/src/screens/deckSimulation/computeDeckDrawOdds.ts` turns editor counts into
rows.

### Limits

- Card effects that draw, search or reveal are not counted.
- The panel measures cards seen, not cards that can be played. It does not check memory,
  digivolution lines or colors.
- Key cards are not saved with the deck.

## Bot matchup

The **Bot matchup** panel runs bot games between the deck being edited and an opponent:
the same deck (mirror), a validated famous deck, or a set of community decks. The player picks 10, 20 or 40
games. The server plays them and the panel polls the job. It shows the win rate (a
draw counts as half), the 95% Wilson interval as a number and as a band, the record,
and up to three sample games.

Both seats use the Standard bot (`createLevelBotOptions` at `standard`, with the
deck's inferred style). Expert and Master are not offered: they use the live search
worker pool that real matches share. Games alternate who goes first. The turn limit is
60; a game that reaches it is a draw. A game with an engine error, a rejected intent or
a policy fallback is reported as invalid and left out of the score.

### Where the games run

`MatchupSimulator` (`apps/api/src/deckSimulation/`) owns the jobs. It runs games in one
`worker_threads` worker (`matchupWorker.ts`), never on the game loop. The worker plays
games one after another through `runBotMatch`, the same harness as the battle fuzzer
and the level panels, and posts each result as it finishes. The worker loads the card
registry once and stops after 60 seconds without work, including after a job that
expired in the queue.

The simulator starts the worker as soon as a job is queued, while the busy-host check
takes its first CPU sample. The check needs two samples at least 1 s apart, so a cold
start costs the slower of the two instead of both in a row.

Matchup games run headless (`runBotMatch` option `headless`). No client watches them,
so the engine skips work that only serves a client or a search:

| Skipped work                                        | Why it is safe here                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Hand affordances                                    | They tell a client which hand cards it can play; no bot reads them     |
| Engine snapshot bookkeeping                         | Snapshots exist for live search; the Standard bot never searches       |
| Once-per-turn, field effect and Negamon projections | Presentation only; search rollouts already skip them (`searchRollout`) |
| Unchanged continuous recomputes                     | Reused when nothing changed, as in search rollouts                     |

The bot still reads the projections it uses: attack targets, activatable effects and
keywords. Sample replays re-simulate the game from its inputs with a full engine, so
the viewer file is unchanged. Every sample still exported without divergence.

### Limits

The limits live in `MATCHUP_LIMITS.ts` and fit a one-CPU host.

| Limit                       | Value                                                                                                                    | Why                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Workers per API process     | 1                                                                                                                        | One game at a time for the whole process           |
| Unfinished jobs per account | 1                                                                                                                        | One player cannot fill the queue                   |
| Queued jobs per process     | 2                                                                                                                        | Bounded wait; more requests get `queue_full`       |
| Games per job               | 10, 20 or 40                                                                                                             | Fixed choices keep the cost predictable            |
| Time budget per job         | 120 s                                                                                                                    | Checked between games; the job ends as `timed-out` |
| Hung worker grace           | 15 s past the budget                                                                                                     | The worker is terminated and replaced              |
| Worker heap                 | 512 MB                                                                                                                   | `resourceLimits.maxOldGenerationSizeMb`            |
| Job starts per account      | 6, one more every 10 minutes                                                                                             | Token bucket                                       |
| Busy host                   | Less than 1 free container core, or over 25% of CPU periods throttled; outside a cgroup, 1-minute load above 1.5 × cores | Queued jobs wait and retry every 1 s               |
| Finished job lifetime       | 15 minutes                                                                                                               | Results and sample replays then disappear          |

A job that runs past the budget ends as `timed-out` with the games it finished.

### Measured speed

Production logs from 2026-11-04, 02:44 to 14:20 UTC, before the speed changes:

| Measure       | Value                                               |
| ------------- | --------------------------------------------------- |
| Jobs          | 85 finished: 73 completed, 8 cancelled, 4 timed out |
| Time per game | p50 2.7 s, p90 4.5 s                                |
| Queue wait    | 12 jobs at 2.0 s, most others 8 to 13 s             |
| 40-game jobs  | 4 of 25 timed out after 27 to 34 games              |

Every job waited at least 2 s because the busy-host check reports busy until it has a
baseline sample. A cold worker added about 6.5 s on the production host. That host
shares four Neoverse-N1 cores with other services, so the worker gets well under one
core.

A local benchmark on Node 26 (four famous-deck pairs, 10 games each, compiled build)
measured the changes:

| Measure                         | Before        | After        |
| ------------------------------- | ------------- | ------------ |
| Game without a sample replay    | 139 to 146 ms | 46 to 55 ms  |
| All games, including 12 samples | 183 to 188 ms | 95 to 103 ms |

All 40 games had the same winner, reason and turn count before and after. A wider
check of eight pairs with 20 games each (160 games) also matched game for game, with
and without the search-rollout shortcuts.

A sample game now costs about four times a plain one (about 210 ms locally), because
the worker records it and then re-simulates it with a full engine to export the
viewer file. A job has at most three samples.

Exporting samples only when a player opens one would save that work, but only if few
players open them. HTTP requests are not logged anywhere on the production host, so
the simulator logs `deckSimulation.replayOpened` with the job, the sample index,
whether the file was still available, and the time since the job finished. Compare its
count with `deckSimulation.finished` before changing how samples are exported.

A V8 compile cache (`NODE_COMPILE_CACHE`) does not shorten worker start. In the API
image on arm64, limited to one core, a worker was ready in 1.1 to 1.4 s with a warm
cache and 1.1 to 1.2 s without one, although V8 accepted every cached module. Module
evaluation, not compilation, dominates the start.

Results are not stored. A process restart loses running and finished jobs. A running
job can be cancelled; it keeps the games it finished.

### Community decks

The opponent list also offers **Community decks**. The player either picks up to five
public community decks or leaves the list empty for the default set: the five most
liked public decks that are legal in the editor's format. The client sends only deck
ids, or nothing for the default set. `CommunityDeckStore.matchupOpponents` loads the
decks on the server and applies the same rules as the random community deck: status
`public` only, so decks hidden by moderation (`040-community-deck-moderation`) and
unpublished decks never take part, plus `deckLegality` for the format and no beta-only
cards. A chosen deck that fails these rules rejects the request.

Each opponent plays 4 or 8 games, one opponent after another, in the same single job.
So a comparison is capped at 5 × 8 = 40 games, the same as the largest single matchup,
and shares its 120 s budget, queue and per-account limits. The panel polls the job and
fills a table as results arrive: the win rate, its 95% interval and the games played per
opponent, sorted from best to worst, with the best and worst rows marked. The overall
win rate sits above the table. With 4 or 8 games per opponent the intervals are wide;
read them as a first screen, not a verdict.

Bot results are kept apart from human statistics. `043-deck-composition-matchups`
indexes human match records by deck composition for deck statistics; bot games are
never written there, so they cannot skew those numbers.

## Turn-by-turn playthrough

Each sample game in a matchup has a **Watch turn by turn** button. It opens the game in
the existing replay viewer (`ReplayViewer`), which steps frame by frame and jumps
between turns. The panel shows the viewer full screen over the editor; closing it
returns to the editor.

The worker records the sample games' inputs with `createMatchReplayRecorder` (through
`runBotMatch`'s `recordReplay`). Right after such a game, the same worker turns the
record into a viewer file with `exportPlayerReplay`, so the re-simulation never runs on
the game loop. It keeps a file only when the re-run has no divergence. The simulator
holds up to three gzipped files per job (about 30 to 45 KB each) in memory, for the
same 15 minutes as the results. With one opponent, the first three games are samples.
With several opponents, the first game against each of the first three opponents is.

A goldfish playthrough is not offered: draw odds are exact calculations, not simulated
games, so there is no game to replay.
