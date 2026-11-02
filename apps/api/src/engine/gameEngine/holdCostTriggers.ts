import type { GameEngine } from "#api/engine/GameEngine";
import type { DigivolveCostTriggers } from "#api/engine/actions/digivolve";
import type { ArmedSubTrigger } from "#api/engine/gameEngine/subTriggerIdentity";
import { withPendingSubTriggers } from "#api/engine/gameEngine/subTriggers";

export function holdCostTriggers(engine: GameEngine): DigivolveCostTriggers {
  const enclosing = engine.digivolveCostSubTriggers;
  const held: ArmedSubTrigger[] = [];
  engine.digivolveCostSubTriggers = held;
  let holding = true;
  let activated = false;
  return {
    stopHolding: () => {
      if (!holding) return;
      holding = false;
      engine.digivolveCostSubTriggers = enclosing;
    },
    activate: async (window) => {
      if (activated) return window?.();
      activated = true;
      await withPendingSubTriggers(engine, [], undefined, window ?? (async () => {}), {
        onlyInitiallyArmed: true,
        alsoArmed: held,
      });
    },
  };
}
