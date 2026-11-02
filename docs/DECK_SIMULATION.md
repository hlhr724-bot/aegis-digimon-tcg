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
registry once and stops after 60 seconds without work.

### Limits

The limits live in `MATCHUP_LIMITS.ts` and fit a one-CPU host.

| Limit                       | Value                           | Why                                                |
| --------------------------- | ------------------------------- | -------------------------------------------------- |
| Workers per API process     | 1                               | One game at a time for the whole process           |
| Unfinished jobs per account | 1                               | One player cannot fill the queue                   |
| Queued jobs per process     | 2                               | Bounded wait; more requests get `queue_full`       |
| Games per job               | 10, 20 or 40                    | Fixed choices keep the cost predictable            |
| Time budget per job         | 120 s                           | Checked between games; the job ends as `timed-out` |
| Hung worker grace           | 15 s past the budget            | The worker is terminated and replaced              |
| Worker heap                 | 512 MB                          | `resourceLimits.maxOldGenerationSizeMb`            |
| Job starts per account      | 6, one more every 10 minutes    | Token bucket                                       |
| Busy host                   | 1-minute load above 1.5 × cores | Queued jobs wait and retry every 2 s               |
| Finished job lifetime       | 15 minutes                      | Results and sample replays then disappear          |

A local run of 10 Standard games against a famous deck took 7.6 s on a development
machine. A 40-game job should fit the 120 s budget on the production host; if not, it
ends as `timed-out` with the games it finished.

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
