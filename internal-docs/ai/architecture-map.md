# Architecture map

Read [the product architecture](../../docs/ARCHITECTURE.md) for design details.

Three workspaces. Dependencies point inward: both apps depend on `@aegis/shared`, and neither app depends on the other.

| Package           | Owns                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Card catalog (`src/cards/data/cards.json`), Colyseus schema, protocol types, ban list, card IR types (`src/effects/ir/`), generated `src/effects/effects.json` |
| `apps/api`        | Colyseus rooms (`src/rooms/`), rules engine (`src/engine/`), card modules (`src/cards/<SET>/`), bots, tournaments, Postgres persistence                        |
| `apps/web`        | React client, PixiJS board, deck builder, lobby                                                                                                                |

### Turn flow

1. A client joins an `AegisRoom` and gets a seat-filtered state view.
2. The client sends an intent. `intentRouter.ts` routes it to `GameEngine`.
3. `GameEngine` validates actor, phase, cost, and targets. `TurnStateMachine` and the phase controllers drive the turn.
4. Actions move cards through the state-access layer and push effects onto the effect stack.
5. A decision pauses resolution until its owner answers.
6. Each event carries `seq`, `batch`, and `stateVersion`. The room ends each batch with `batchClosed`. The client paces its own animation from this stream. It draws the board from the batch snapshot and reads live state for legality.

### Cards and effects

- Each card is one module at `apps/api/src/cards/<SET>/<CARD-ID>.ts`. `apps/api/src/cards/index.ts` imports them all at boot.
- Every card is a declarative `CompiledCard` registered with `registerIrCard` (`apps/api/src/engine/effects/interpreter/registration/module.ts`). The interpreter in `engine/effects/interpreter/` runs it. `registerCard` with a hand-written `EffectModule` is legacy.
- `effects.json` is a generated snapshot. Edit the card module, then run the sync command from [cards and rules](cards-and-rules.md).
- Continuous effects are recomputed from active sources (`engine/effects/continuous.ts`). They are never stored as permanent mutations.
- Search rollout engines skip a recompute when nothing it reads has changed; live matches never do. See [skipping unchanged recomputes](../../docs/ARCHITECTURE.md#skipping-unchanged-recomputes). Engine state that static effects read must change through the schema or a ledger method, or be added to the recompute key.
- Search rollouts restore engines from a per-search prepared snapshot (`engine/snapshot/prepareGameEngineRestore.ts`): the game state is decoded once and copied per rollout by `createEngineSchemaCloner`. A new schema class or field must keep `preparedGameEngineRestore.test.ts` passing; live matches and replays use the full decode.

### Trigger resolution

One game event produces one pool of triggers. A single loop resolves the pool:

1. **Collect** printed triggers and armed SubTrigger watchers. The loop rebuilds the pool on every pass, so a trigger whose condition lapses drops out.
2. **Order**: turn player first. Each controller picks the next trigger from their own group.
3. **Resolve one**, then run the rule sweep and drain the deferred queues. A trigger derived from the effect that just resolved activates before older pending triggers.

`docs/ARCHITECTURE.md` explains the SubTrigger consumption identity and the multi-process (Redis) setup.

### Persistence and processes

- Migrations in `apps/api/src/db/migrations` are sequential and run at startup.
- A room and its engine live in one process. Match state is not durable.
- With `AEGIS_REDIS_URL` and `AEGIS_PROCESS_PATH` unset, the API runs as one process. `pnpm dev` runs it this way.
