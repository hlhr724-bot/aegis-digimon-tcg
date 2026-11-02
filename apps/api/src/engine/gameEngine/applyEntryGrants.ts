import type { GameEngine } from "../GameEngine.js";
import { buildSubTriggerContext } from "./subTriggers.js";
import { withTriggeredMutations } from "./windows.js";

const applying = new WeakSet<GameEngine>();

export async function applyEntryGrants(engine: GameEngine, permanentIds?: readonly string[]): Promise<void> {
  const grants = engine.subTriggers.entryGrants();
  if (grants.length === 0 || applying.has(engine)) return;
  const subjects = permanentIds ?? battleAreaPermanentIds(engine);
  if (subjects.length === 0) return;
  applying.add(engine);
  try {
    await withTriggeredMutations(engine, async () => {
      for (const grant of grants) {
        for (const subjectPermanentId of subjects) {
          const ctx = buildSubTriggerContext(engine, grant, { subjectPermanentId });
          if (ctx === undefined || grant.matches?.(ctx) === false) continue;
          await grant.run(ctx);
        }
      }
    });
  } finally {
    applying.delete(engine);
  }
}

function battleAreaPermanentIds(engine: GameEngine): string[] {
  const ids: string[] = [];
  for (const player of engine.state.players) {
    if (player === undefined) continue;
    for (const permanent of player.battleArea) ids.push(permanent.permanentId);
  }
  return ids;
}
