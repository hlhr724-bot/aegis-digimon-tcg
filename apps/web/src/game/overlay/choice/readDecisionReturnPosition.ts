import type { WindowPosition } from "@/game/chat/useDraggableWindow";
import { DECISION_RETURN_POSITION_KEY } from "@/game/overlay/choice/decisionReturnPositionKey";

export function readDecisionReturnPosition(): WindowPosition | undefined {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(DECISION_RETURN_POSITION_KEY) ?? "null");
    if (
      typeof stored === "object" &&
      stored !== null &&
      "left" in stored &&
      "top" in stored &&
      Number.isFinite(stored.left) &&
      Number.isFinite(stored.top)
    ) {
      return { left: Number(stored.left), top: Number(stored.top) };
    }
  } catch {
    return undefined;
  }
  return undefined;
}
