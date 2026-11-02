# Tournament standings

The API ranks Swiss and round robin standings from the result ledger each time they are read. Points always come first. The tournament's rules then list the tiebreakers in order. A seeded random draw always comes last.

## Choosing tiebreakers

The organizer picks the tiebreakers and their order when creating the event, as Tonamel does. "Auto" uses the default for the structure. The list is frozen in `rules_snapshot` and never changes after creation.

| Structure   | Default order                   | Options                                                                                           |
| ----------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Swiss       | OMW% → GW% → OOMW%              | OMW%, GW%, OOMW%, head-to-head, MW%, opponents' points, beaten opponents' points, game difference |
| Round robin | Match wins → head-to-head → GW% | Match wins, head-to-head, GW%, game difference                                                    |

OMW% and OOMW% measure how strong your opponents were. In a round robin everyone plays the same opponents, so those measures cannot separate players and are not offered.

Events created before this change keep their frozen order: MW% → OMW% → head-to-head → random draw.

## How each tiebreaker is settled

| Tiebreaker                    | How the API settles it                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Points                        | Win or bye 3, draw 1, loss 0.                                                                                                                                                  |
| Match win % (MW%)             | The player's own rate, without byes.                                                                                                                                           |
| Opponents' match win % (OMW%) | The average of the opponents' rates. A rate below 33% counts as 33%.                                                                                                           |
| OOMW%                         | The average of the opponents' OMW%.                                                                                                                                            |
| Game win % (GW%)              | Games won divided by games played, without byes. In Best of 1 it equals MW%.                                                                                                   |
| Game difference               | Games won minus games lost.                                                                                                                                                    |
| Match wins                    | Matches won. A bye is not a match win.                                                                                                                                         |
| Opponents' points             | The sum of every opponent's points.                                                                                                                                            |
| Beaten opponents' points      | The sum of the points of the opponents the player beat.                                                                                                                        |
| Head-to-head                  | Within a tied group, a player who beat every other player in the group ranks first. The rule repeats for the players left. A cycle or an unplayed match leaves the group tied. |
| Random draw                   | A seeded draw orders the group. The tournament ID is the seed, so the same tie always gives the same order.                                                                    |

Game scores come from the series (`wins0` and `wins1`) when a match is ledgered. Results ledgered before migration 054 have no game scores and count as zero games.

A player "beat" another player when they won more of their matches against each other. A split rematch is not a win.

**Extra match** needs a match played outside the standings, so the API skips it and reports it in `unresolvedTiebreakers`.

When every listed tiebreaker leaves players tied, the API orders them by registration seed, then by participant ID.

## Round count and Top Cut size

Both default to "Auto" and are frozen when check-in closes.

- **Swiss rounds:** the official table by player count, or the organizer's fixed count (1 to 10).
- **Round robin rounds:** always one round per opponent. An odd field adds one round, and each player gets one bye.
- **Top Cut:** the official table by player count, or the organizer's size (2, 4, 8, 16 or 32). If fewer players check in, a fixed size halves until it fits the field.

## Finished tournaments

Tournaments with a Top Cut keep a frozen copy of their standings. Swiss-only and round-robin-only tournaments store their winner and trophies when they finish, but their standings are recalculated whenever they are read. A rules change can therefore reorder the standings of a finished tournament without a Top Cut, but it does not change the stored winner.
