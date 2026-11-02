import { ArenaZone } from "@/game/arena3d/ArenaZone";
import { Side } from "@/game/side";

const VIEWER_RAISING_KEY = `${Side.Viewer}:${ArenaZone.RAISING.value}`;

export function readArenaRaisingSocket(breedingPermanents: ReadonlyMap<string, string>): number {
  return breedingPermanents.has(VIEWER_RAISING_KEY) ? 0 : 1;
}
