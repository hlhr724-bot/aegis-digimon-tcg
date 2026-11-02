import { BoardStyle } from "@/game/arena3d/boardStyle/BoardStyle";

type Params = {
  preference: BoardStyle;
  webGlAvailable: boolean;
};

export function resolveBoardStyle({ preference, webGlAvailable }: Params): BoardStyle {
  if (preference !== BoardStyle.ARENA_3D.value || !webGlAvailable) {
    return BoardStyle.CLASSIC.value;
  }
  return BoardStyle.ARENA_3D.value;
}
