import type { AnimationStepContext } from "@/game/animationQueue";
import { waitForPaintedAnimation } from "@/game/paintedAnimationClock";

export async function waitForHandSourceClock(key: number, minimumMs: number, context: AnimationStepContext) {
  await waitForPaintedAnimation(
    () =>
      typeof document === "undefined"
        ? null
        : document.querySelector(
            `.game-hand-source-focus[data-activation-key="${key}"] .game-hand-source-focus__scale`,
          ),
    "battle-hand-focus-scale",
    minimumMs,
    context,
  );
}
