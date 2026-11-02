# Tournament standings

The API ranks Swiss standings from the result ledger each time they are read. Points always come first. The tournament's rules then list the tiebreakers in order.

## Default tiebreakers

| Order | Tiebreaker                    | How the API settles it                                                                                                                                                         |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Points                        | Win or bye 3, draw 1, loss 0.                                                                                                                                                  |
| 2     | Match win % (MW%)             | The player's own rate, without byes.                                                                                                                                           |
| 3     | Opponents' match win % (OMW%) | The average of the opponents' rates. A rate below 33% counts as 33%.                                                                                                           |
| 4     | Head-to-head                  | Within a tied group, a player who beat every other player in the group ranks first. The rule repeats for the players left. A cycle or an unplayed match leaves the group tied. |
| 5     | Random draw                   | A seeded draw orders the group. The tournament ID is the seed, so the same tie always gives the same order.                                                                    |

A player "beat" another player when they won more of their matches against each other. A split rematch is not a win.

## Other tiebreakers

- **OOMW%** (the average of the opponents' OMW%) is supported for rulesets that list it.
- **Extra match** needs a match played outside the standings, so the API skips it and reports it in `unresolvedTiebreakers`.

When every listed tiebreaker leaves players tied, the API orders them by registration seed, then by participant ID.

## Finished tournaments

Tournaments with a Top Cut keep a frozen copy of their Swiss standings. Swiss-only tournaments store their winner and trophies when they finish, but their standings are recalculated whenever they are read. A rules change can therefore reorder the standings of a finished Swiss-only tournament without changing the stored winner.
