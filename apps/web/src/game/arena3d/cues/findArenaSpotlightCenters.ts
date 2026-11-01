import type { ScreenPoint } from "@/game/arena3d/ArenaPulse";

const RING_SELECTOR = ".game-spotlight .game-spotlight__ring";

export function findArenaSpotlightCenters(root: HTMLElement | null): ScreenPoint[] {
  const centers: ScreenPoint[] = [];
  for (const ring of root?.querySelectorAll<SVGGraphicsElement>(RING_SELECTOR) ?? []) {
    const rect = ring.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      centers.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
  }
  return centers;
}
