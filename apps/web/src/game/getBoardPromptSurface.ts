import type { BoardPromptVariant } from "@/game/BoardDecisionRail";
import type { EffectPromptPosition } from "@/game/effectPromptPosition";

type BoardPromptSurfaceParams = {
  variant: BoardPromptVariant;
  position: EffectPromptPosition;
};

export function getBoardPromptSurface({ variant, position }: BoardPromptSurfaceParams): EffectPromptPosition {
  if (variant === "prompt") {
    return position;
  }
  return "left";
}
