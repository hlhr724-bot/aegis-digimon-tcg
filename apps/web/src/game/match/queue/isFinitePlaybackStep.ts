import type { AnimationStep } from "@/game/animationQueue";
import { CueTrack } from "@/game/match/enums";
import { OPTION_DOCK_TRACKS } from "@/game/match/tracks";

export function isFinitePlaybackStep(step: AnimationStep): boolean {
  return (
    step.track !== "sound" &&
    step.track !== CueTrack.SecurityDock &&
    step.track !== CueTrack.SecurityHold &&
    !OPTION_DOCK_TRACKS.includes(step.track ?? "")
  );
}
