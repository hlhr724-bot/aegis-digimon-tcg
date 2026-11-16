import type { AnimationStep } from "@/game/animationQueue";
import { CueTrack } from "@/game/match/enums";

export function waitsForPhaseRibbons(step: AnimationStep): boolean {
  return !(
    step.track === "phaseBanner" ||
    step.track === "unsuspendSweep" ||
    step.track === CueTrack.DrawPresentation ||
    step.track?.startsWith("turnDrawFlight-") === true
  );
}
