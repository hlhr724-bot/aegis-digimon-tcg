import type { AnimationQueueMode } from "../animationQueue";
import { motionPreference } from "@/design/motion/motionPreference";

/**
 * `prefers-reduced-motion` and a hidden tab put the queue in `drain` mode,
 * which collapses the decorative cues and leaves the ones that carry
 * something to read their full time. This is the only module allowed to read
 * `window` or `document`.
 */
/** The phone layouts, matching GameScreen's `NARROW_LAYOUT_QUERY` and the touch block in game.css. */
export const TOUCH_LAYOUT_QUERY = "(width < 600px), (height < 520px) and (orientation: landscape)";

export function isTouchLayout(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(TOUCH_LAYOUT_QUERY).matches;
}

export function documentHidden(): boolean {
  return typeof document !== "undefined" && document.hidden === true && !forcesLiveMotion();
}

/**
 * Dev builds only: `?motion=live` keeps real timing in a tab the browser reports as hidden,
 * such as an automated or occluded window, so pacing can still be measured there.
 */
function forcesLiveMotion(): boolean {
  return (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("motion") === "live"
  );
}

export function liveMode(): AnimationQueueMode {
  return motionPreference.isReduced() || documentHidden() ? "drain" : "live";
}
