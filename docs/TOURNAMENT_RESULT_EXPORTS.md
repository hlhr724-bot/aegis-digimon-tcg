# Tournament result exports

When a tournament finishes, the API saves an immutable **result export** of the event once, for a future DigiLab upload.

The `results` step of the tournament worker sweep (`runSweeps` in [apps/api/src/index.ts](../apps/api/src/index.ts)) writes it, right after the `trophies` step. [TournamentResultStore](../apps/api/src/tournaments/results/TournamentResultStore.ts) owns the sweep and the export read. Cancelled events are never exported.

## Final placement

[getFinalPlacements](../apps/api/src/tournaments/results/getFinalPlacements.ts) is a pure function. It places every participant who played at least one match (a bye counts). Check-in no-shows never played, so they get no placement.

| Event shape                    | Placement rule                                                                                                                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single elimination or Top Cut  | Champion is 1st. The finalist is 2nd. Players who lost earlier share a band by the round they lost in: semifinal losers are 3rd, quarterfinal losers 5th, round-of-16 losers 9th, and so on. A double loss places both players in that band. |
| Swiss with a Top Cut           | Bracket players are placed by the bracket. Everyone else follows in Swiss standings order, starting right after the bracket players.                                                                                                         |
| Swiss without a Top Cut        | Swiss standings order: 1st, 2nd, 3rd and so on.                                                                                                                                                                                              |
| Dropped or disqualified player | Swiss standings only list active players, so these players follow the ranked field, ordered by match points (win or bye 3, draw 1). In a bracket, the round they lost in places them as usual.                                               |

The champion comes from the `tournament_finished` audit event. If that event has no participant, the winner of the final bracket match is the champion.

## Storage

Migration [044-community-tournaments](../apps/api/src/db/migrations/044-community-tournaments.ts) adds `tournament_result_exports`: one immutable JSON payload per finished tournament, keyed by `tournament_id`. The sweep writes it once with `ON CONFLICT DO NOTHING` and never updates it.

## Export API

`GET /tournaments/:id/export` returns the payload.

| Caller                          | Response                          |
| ------------------------------- | --------------------------------- |
| Not signed in                   | 401                               |
| Unknown or malformed event ID   | 404 `tournament_not_found`        |
| Not the organizer and not admin | 403 `tournament_export_forbidden` |
| Event not finished or not swept | 404 `tournament_export_not_ready` |
| Organizer or platform admin     | 200 with the payload              |

### Schema version 1

The type is [TournamentResultExport](../packages/shared/src/tournaments/TournamentResultExport.ts).

- `schemaVersion`: always `1`. Change the number for any breaking change.
- `exportedAt`: when the sweep built the payload (epoch ms).
- `event`: `id`, `name`, `organizerDisplayName`, `category`, `format`, `cardPool` (`all` or a set such as `BT10`), `deckRules` (`standard`, `pauper`, `unlimited`), `structure`, `bestOf`, `topCutSize`, `scheduledStartAt`, `startedAt` (first phase created) and `finishedAt`.
- `participants`, ordered by placement: `participantId`, `displayName`, `accountId` (null for bots), `kind` (`human` or `bot`), `placement`, `wins`, `losses`, `draws`, `byes`, `dropped`, `disqualified`, and `decklist`.
- `decklist`: the deck frozen at check-in, as `mainDeck` and `eggDeck` lists of `{ cardId, count }`. Alternate arts are not exported.
- `matches`, ordered by round and table: `round`, `phase` (`swiss`, `top_cut`, `single_elimination`), `table`, `player1ParticipantId`, `player2ParticipantId`, `player1GamesWon`, `player2GamesWon`, `winnerParticipantId`, `result` (`player1`, `player2`, `draw`, `double_loss`, `bye`, `unresolved`) and `bye`.

Wins, losses and draws come from the result ledger. Byes are counted separately, not as wins. Losses include no-show losses, concessions and double losses.

### Assumptions about DigiLab

The existing DigiLab deck import ([parseProviderResponse](../apps/api/src/deckProviders/providers/parseProviderResponse.ts)) shows that DigiLab:

- uses the same card ID format as Aegis (for example `BT1-010`), because imported IDs go straight into Aegis decks;
- stores decklists as card ID plus count, so the export uses `{ cardId, count }` instead of one entry per copy;
- reports results as `placement`, `wins`, `losses` and `ties`. The export uses `draws` for ties.

DigiLab splits the main deck into Digimon, Tamers and Options. The export keeps one `mainDeck` list; an uploader can split it with the card catalog.

## Not done

- No DigiLab upload or any outbound call. The export is only stored and served.
- No UI for the export; organizers and admins use the API route.
- No season points or tournament leaderboard.

Tournament presets have been removed. New exports omit preset identifiers and versions. Previously stored exports are immutable and may retain those legacy metadata fields.
