import type { Seat } from "@aegis/shared/schema/enums";
import type { GameEngine } from "#api/engine/GameEngine";

type Params = { engine: GameEngine; observer: Seat };

const SAMPLED_COMBAT_WINDOWS: ReadonlySet<string> = new Set(["block", "counter"]);

export function isHiddenSamplingWindow({ engine, observer }: Params): boolean {
  if (engine.state.pendingDecision !== undefined) {
    return false;
  }
  const window = engine.state.combatWindow;
  return window === undefined || (window.seat === observer && SAMPLED_COMBAT_WINDOWS.has(window.kind));
}
