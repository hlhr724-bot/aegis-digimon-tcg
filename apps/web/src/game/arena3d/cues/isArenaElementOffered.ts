import type { ScreenPoint } from "@/game/arena3d/ArenaPulse";

type Params = {
  element: Element | null | undefined;
  centers: readonly ScreenPoint[];
};

export function isArenaElementOffered({ element, centers }: Params): boolean {
  if (!element || centers.length === 0) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return centers.some(
    (center) => center.x >= rect.left && center.x <= rect.right && center.y >= rect.top && center.y <= rect.bottom,
  );
}
