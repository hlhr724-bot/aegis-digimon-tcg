import { CardFinish, type CardFinishEntry } from "@/design/webglCard/CardFinish";

export function getCardAuraRayStrength(finish: CardFinishEntry): number {
  if (finish.shaderIndex < CardFinish.STARLIGHT.shaderIndex) {
    return 0;
  }
  return 0.25 + (finish.shaderIndex - CardFinish.STARLIGHT.shaderIndex) * 0.08;
}
