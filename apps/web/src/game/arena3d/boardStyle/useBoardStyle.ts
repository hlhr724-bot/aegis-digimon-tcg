import { useState } from "react";
import type { BoardStyle } from "@/game/arena3d/boardStyle/BoardStyle";
import { boardStylePreference } from "@/game/arena3d/boardStyle/boardStylePreference";
import { resolveBoardStyle } from "@/game/arena3d/boardStyle/resolveBoardStyle";
import { isWebGlAvailable } from "@/game/arena3d/isWebGlAvailable";

export function useBoardStyle(): BoardStyle {
  const preference = boardStylePreference.useStyle();
  const [webGlAvailable] = useState(isWebGlAvailable);
  return resolveBoardStyle({ preference, webGlAvailable });
}
