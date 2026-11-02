# Mandatory unsuspend target pool

## Current contract (2026-10-19)

An effect may target a Digimon that is already in the requested state. The
effect then does nothing to it. Official Q&A Q845 (ST18-10) and Q993 (BT2-002)
confirm this for suspend and unsuspend effects.

The `Unsuspend` board action normally offers only suspended permanents. This
keeps automatic and human choices from wasting an own-side unsuspend
(BT15-063).

A mandatory unsuspend whose pool can include the opponent's Digimon uses the
printed pool instead. Otherwise the only legal suspended target can be the
opponent's Digimon that the same effect has just suspended, and the engine
picks it automatically. The player must be able to choose an active Digimon so
that the opponent's Digimon stays suspended.

| Case                                            | Pool                                              |
| ----------------------------------------------- | ------------------------------------------------- |
| Pool limited to your own permanents             | Suspended permanents only                         |
| Optional unsuspend ("You may unsuspend")        | Suspended permanents only; the player can decline |
| Mandatory unsuspend that can reach the opponent | Printed pool                                      |
| Chained same-target continuation                | Printed pool                                      |

Affected cards: ST18-12 Zephagamon, ST18-15 Anemoi Embrace, and P-109
Imperialdramon: Dragon Mode ("Suspend 1 Digimon. Then, unsuspend 1 Digimon.").

Regression: `apps/api/src/cards/ST18/ST18-12.test.ts`, "lets the unsuspend
choose an active Digimon so the opponent's suspended Digimon stays suspended".
