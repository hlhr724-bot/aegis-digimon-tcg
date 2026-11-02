import { motionPreference } from "@/design/motion/motionPreference";

/* The phone's answer to a tap.

   On a portrait phone the board tap is how a player moves the narration on
   (docs/presentation-queue-plan.md §3.2), and a tap that only changes text in a corner can
   read as a tap that missed. A single short buzz says the tap landed.

   Two guards, both deliberate: `navigator.vibrate` is absent on iOS and on every desktop
   browser, and a player who asked for reduced motion asked not to be shaken either. */

/** Long enough to feel, short enough that a chain of moments does not rattle. */
export const NARRATION_TAP_VIBRATION_MS = 10;

/** Acknowledges a touch that advanced a narration item. Silent wherever it cannot buzz. */
export function vibrateNarrationAdvance(): void {
  if (typeof navigator === "undefined" || motionPreference.isReduced()) return;
  navigator.vibrate?.(NARRATION_TAP_VIBRATION_MS);
}
