import type { ScreenPoint } from "@/game/arena3d/ArenaPulse";

export function getElementCenter(element: Element | null | undefined): ScreenPoint | undefined {
  if (!element) {
    return undefined;
  }
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
