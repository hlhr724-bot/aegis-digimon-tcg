# Achievements and trophies

Players earn trophies for tournament placements and for final tournament circuit standings. Ranked seasons grant badges and profile frames, never trophies. The API grants and stores every trophy. The client only displays them on the player's profile.

## Tiers and awards

[TrophyAward](../packages/shared/src/achievements/TrophyAward.ts) is the single mapping from an achievement to a tier. Change a tier there; persisted trophies keep the tier they were granted with.

| Award                  | Source                        | Tier    |
| ---------------------- | ----------------------------- | ------- |
| `tournament_champion`  | Community tournament champion | Gold    |
| `tournament_top_four`  | Community tournament Top 4    | Silver  |
| `tournament_top_eight` | Community tournament Top 8    | Bronze  |
| `circuit_champion`     | Tournament circuit 1st place  | Rainbow |
| `circuit_top_four`     | Tournament circuit Top 4      | Gold    |
| `circuit_top_eight`    | Tournament circuit Top 8      | Silver  |

Tier values are `bronze`, `silver`, `gold` and `rainbow` ([TrophyTier](../packages/shared/src/achievements/TrophyTier.ts)). Single tournaments grant Bronze, Silver and Gold. Only a circuit champion earns Rainbow.

## Community tournaments

Tournament completion grants trophies immediately, in the same database transaction that persists the final result and the `tournament_finished` event. This applies to single elimination, Swiss without Top Cut, Top Cut finals, and legacy account-based brackets. Trophy delivery does not depend on the deadline worker, Discord integration, or `TOURNAMENT_SCHEDULER`.

- Placements come from [computeTournamentPlacements](../apps/api/src/tournaments/discord/computeTournamentPlacements.ts), the same calculation that drives the Discord results post and placement roles. Swiss completion passes its standings from the transaction that just closed the final round. Legacy brackets derive placements from their account-based match seats.
- Each account receives at most one trophy per tournament: its highest placement.
- Bots and participants without an account receive nothing.
- The award date is the time of the `tournament_finished` event, or completion time for legacy brackets without that event.
- The transaction claims a tournament with its `tournament_trophy_grants` row and inserts trophies together. A failed grant rolls back completion, and retrying completion cannot create duplicate awards.

`TrophyStore.sweepTournamentTrophies` remains available for explicit recovery of historical finished events without a grant. It is not scheduled automatically.

## Tournament circuits

The circuit `finalize` pass grants circuit trophies once, in the same transaction that freezes the final circuit leaderboard. The award comes from the frozen position: 1st earns `circuit_champion`, 2nd to 4th `circuit_top_four`, and 5th to 8th `circuit_top_eight`. Tied players share a position, so more than eight players can earn a trophy. A player with 0 points earns nothing. See [tournament circuits](TOURNAMENT_CIRCUITS.md).

## Ranked seasons

Season finalization grants only ranked cosmetics. It does not create trophies. Historical season trophy records are excluded from the trophy cabinet; the legacy database columns remain for storage compatibility.

## Display

`GET /achievements/trophies` returns the signed-in player's trophies, newest first. It requires a session and responds with `private, no-store`. The profile shows compact trophy cards with their image, tier, source tournament name and award date, and an empty state when there are none. The profile’s Show trophies switch hides or restores the cabinet. Its `profileTrophies` account preference is synchronized across devices and defaults to visible; earned trophies remain stored. Aegis has no public profile yet; when one exists, it can reuse [TrophyCabinet](../apps/web/src/achievements/TrophyCabinet.tsx) with a public read route.

Trophy images are WebP files at 128 and 256 pixels in `apps/web/public/trophies/`. The 1024-pixel source PNGs are not shipped. They stay outside `/achievements/` because the gateway routes that prefix to the API.

## Known limitations

- Trophies are never revoked automatically. Changing a tournament result after the grant leaves existing trophies in place. An administrator must delete the `player_trophies` row by hand.
- A trophy persistence failure rolls back finalization. The underlying database issue must be resolved before finalization can succeed.
