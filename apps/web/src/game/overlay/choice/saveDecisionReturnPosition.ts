import type { WindowPosition } from "@/game/chat/useDraggableWindow";
import { DECISION_RETURN_POSITION_KEY } from "@/game/overlay/choice/decisionReturnPositionKey";

export function saveDecisionReturnPosition(position: WindowPosition | undefined): void {
  try {
    if (position) localStorage.setItem(DECISION_RETURN_POSITION_KEY, JSON.stringify(position));
    else localStorage.removeItem(DECISION_RETURN_POSITION_KEY);
  } catch {
    return;
  }
}
