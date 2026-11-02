# Tournament circuits

A circuit is a series of official tournaments that run on a weekly or monthly schedule during a fixed period. The API creates each tournament ahead of time, opens sign-ups and starts it on time. Each finished tournament adds points to one circuit leaderboard. When the period ends, the API freezes the leaderboard, grants trophies and posts the final standings to Discord.

"Circuit" is the name because "program", "series" and "season" already mean other things in this codebase.

## Who can do what

| Action                         | Who                                                   |
| ------------------------------ | ----------------------------------------------------- |
| Create or cancel a circuit     | Platform admins only                                  |
| View circuits and leaderboards | Anyone, without signing in                            |
| Join a circuit event           | Any signed-in player, through the normal sign-up flow |

Circuit events are `official` tournaments. Their organizer is the admin who created the circuit.

## Settings

| Setting              | Rule                                                                                                         | Default           |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------- |
| Period               | Ends after it starts, at most 366 days long, and not already over                                            | None              |
| Time zone            | Any IANA time zone, such as `America/Sao_Paulo`                                                              | Browser time zone |
| Cadence              | `weekly` or `monthly`. All slots of a circuit use the same cadence                                           | `weekly`          |
| Slots                | 1 to 14 different day and `HH:MM` pairs, read in the circuit time zone. See [slots](#slots)                  | Saturday 18:00    |
| Lead time            | 1 hour to 14 days. Each event is created, and sign-ups open, this long before it starts                      | 48 hours          |
| Check-in window      | 5 to 120 minutes, shorter than the lead time. Check-in opens this long before start. Sign-ups close at start | 15 minutes        |
| Tournament template  | Any valid tournament settings: structure, best-of, Top Cut, bots, capacity                                   | Swiss, best of 1  |
| Points table         | 1 to 32 rows. Placements must rise and points must not rise from row to row                                  | 25, 18, 12, 8     |
| Participation points | 0 to 100                                                                                                     | 1                 |

The API checks the template with the same rules as a hand-made tournament, and checks it again when it creates each event. It rejects a circuit with no slot inside the period. Local times stay correct across daylight saving changes.

Admins set scoring when they create a circuit. Scoring cannot change after that, which keeps every event scored the same way. To change scoring, cancel the circuit and create a new one.

### Slots

The `schedule` field holds the cadence and its slots.

| Cadence   | Slot shape                | Day range       |
| --------- | ------------------------- | --------------- |
| `weekly`  | `{ weekday, localTime }`  | 0 (Sunday) to 6 |
| `monthly` | `{ monthDay, localTime }` | 1 to 31         |

A monthly slot on day 29, 30 or 31 runs on the last day of a month that lacks that day. For example, day 31 runs on 30 April and on 28 February. When two slots land on the same day and time this way, the API creates one event.

## Scoring

The `points` pass reads each finished circuit event's [result export](TOURNAMENT_RESULT_EXPORTS.md).

- A placement earns the points of the first row whose "up to placement" value it reaches, plus the participation points.
- A player outside every row earns only the participation points.
- Bots, players without an account, disqualified players, and players who played no game (for example, no-shows) earn nothing.
- Dropped players keep the placement they reached.

The leaderboard sorts by total points, then by best placement. Players who tie on both share a position. Names break the tie only in display order.

## Lifecycle

The tournament deadline worker runs these passes. In production it runs by default. Locally, set `TOURNAMENT_SCHEDULER=on`.

| Pass         | Runs             | What it does                                                                                                                                                                                                                        |
| ------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto_start` | Every tick (5 s) | Starts `auto_start` events whose start time has passed. A Swiss event with fewer than 2 checked-in players is cancelled. A single-elimination event uses the existing start, which fills bots or cancels a field that is too small. |
| `schedule`   | Every 15 s       | Creates the events of active circuits that start within the lead time. Each event ID comes from the circuit and the start time, so each event is created only once.                                                                 |
| `points`     | Every 15 s       | Records points for finished circuit events that have a result export.                                                                                                                                                               |
| `finalize`   | Every 15 s       | After the period ends, and once every event has finished or been cancelled and every finished event has points, freezes the leaderboard, grants [trophies](ACHIEVEMENTS.md) and marks the circuit `finished`.                       |
| `discord`    | Every 15 s       | Posts the final Top 8 of each finished circuit to the tournament Discord channel. Retries with backoff. Off when [Discord](TOURNAMENT_DISCORD.md) is not configured.                                                                |

Cancelling a circuit stops scheduling and cancels its events that have not started. Running events finish normally, but a cancelled circuit is never finalized.

## API

| Method and path                                 | Access | Purpose                                                     |
| ----------------------------------------------- | ------ | ----------------------------------------------------------- |
| `GET /tournament-circuits`                      | Public | All circuits, active first                                  |
| `GET /tournament-circuits/:id`                  | Public | One circuit with its events and the next 5 start times      |
| `GET /tournament-circuits/:id/leaderboard?page` | Public | 50 rows per page, plus the signed-in player's own row       |
| `POST /tournament-circuits`                     | Admin  | Create a circuit; `400` lists each failed rule in `reasons` |
| `POST /tournament-circuits/:id/cancel`          | Admin  | Cancel an active circuit; `409` if it already closed        |

Contracts live in [TournamentCircuitContracts](../packages/shared/src/tournaments/circuits/TournamentCircuitContracts.ts). Storage is described in [COLLECTIONS](../COLLECTIONS.md#tournament-circuits).

## Known limitations

- Admins cannot edit a circuit after creating it.
- A circuit does not roll over into a new period. Create a new circuit for the next period.
- When the worker is down past an event's start, it does not create that missed event later.
