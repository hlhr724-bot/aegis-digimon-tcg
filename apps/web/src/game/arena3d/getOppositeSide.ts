import { Side } from "@/game/side";

export function getOppositeSide(side: Side): Side {
  return side === Side.Viewer ? Side.Opponent : Side.Viewer;
}
