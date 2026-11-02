# Tournament series clock

Each tournament confrontation (series) has one shared deadline: the phase's round clock plus the ruleset's overtime. `seriesDurationFor` in `apps/api/src/tournaments/rules/clocks.ts` computes it. The deadline scheduler acts when it passes.

## When the deadline passes

| Situation at the deadline                                     | Result                                                                                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No game is in progress                                        | The series is decided at once: the player ahead on game wins takes it. A tie follows the timeout policy: Swiss draws or double-loses, and elimination parks the series as `needs_organizer_decision`. |
| A game is in progress (`tournament_games.status = 'playing'`) | The series moves to `overtime` and the game keeps going. The scheduler postpones its deadline row to the deadline plus `LIVE_GAME_GRACE_MS` (10 minutes).                                             |

A game counts as in progress only after the room reports it started (`markGamePlaying`). A room that was claimed but never started does not delay the decision.

## During overtime

- No new game can be authorized. `authorizeNextGame` returns `no_games_remaining`.
- If the live game decides the series, the room's result resolves it as usual (`series_won`) and retires the deadline row.
- If the live game ends without deciding the series (a draw, or one game of a longer series), the deadline row moves to the game's finish time. The scheduler then decides on the score at its next pass.
- If the game is still running when the grace period ends, the scheduler voids it and decides on the score as before. In elimination, a tie still parks for an organizer.

## Why

Before this rule, the scheduler voided a running game at the deadline. The room was not told, so the players kept playing, and the room's result was then rejected with `game … is already voided`. On 2026-11-01, this threw away a best-of-one semifinal won by deck-out 2 minutes 44 seconds after the deadline, and the series was parked for a judge.

## Known limits

- The room still does not show the series clock or end the game at the deadline. If a game runs past the grace period, the same rejection can still happen.
- `LIVE_GAME_GRACE_MS` is a server constant, not part of the frozen `rules_snapshot`. Changing it affects running events.
