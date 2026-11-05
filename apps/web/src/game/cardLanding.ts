import { useLayoutEffect, useRef } from "react";
import evidence from "./particleLight.json";
import { isInsideLiveArena3d } from "@/game/arena3d/isInsideLiveArena3d";

const plane = evidence.spatial.cardPlane;
const angle = (plane.parentAngle * Math.PI) / 180;
/** Nominal camera projection; Aegis supplies its own board principal point. */
export const CARD_LANDING_DEPTH =
  (2 * plane.fall * Math.tan((evidence.spatial.fieldOfView * Math.PI) / 360) * Math.cos(angle)) /
  plane.referenceSize[1]!;
export const CARD_LANDING_RISE = (plane.fall * Math.sin(angle)) / plane.printedWidth;
export const CARD_LANDING_MS = plane.durationMs;

export function cardLandingPose(ageMs: number, width: number, x: number, y: number) {
  const t = Math.max(0, Math.min(1, ageMs / CARD_LANDING_MS));
  const n = 2.75;
  let bounce: number;
  if (t < 1 / n) bounce = 7.5625 * t * t;
  else if (t < 2 / n) bounce = 7.5625 * (t - 1.5 / n) ** 2 + 0.75;
  else if (t < 2.5 / n) bounce = 7.5625 * (t - 2.25 / n) ** 2 + 0.9375;
  else bounce = 7.5625 * (t - 2.625 / n) ** 2 + 0.984375;
  const remaining = 1 - bounce;
  const scale = 1 / (1 - CARD_LANDING_DEPTH * remaining);
  return {
    scale,
    x: x * (scale - 1),
    y: y * (scale - 1) - width * CARD_LANDING_RISE * remaining * scale,
  };
}

/** Measure the unscaled frame before paint, so an accepted arrival never jumps
 * after its first frame. The printed card's resting layout remains untouched. */
export function useCardLanding(cueKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = ref.current;
    const board = frame?.closest(".game-board");
    if (!frame || !board || isInsideLiveArena3d(frame)) return;
    const offsetParent = frame.offsetParent;
    if (!(offsetParent instanceof HTMLElement)) return;
    const parent: HTMLElement = offsetParent;
    function write(name: string, value: string) {
      if (frame!.style.getPropertyValue(name) !== value) frame!.style.setProperty(name, value);
    }
    function measure() {
      const box = board!.getBoundingClientRect();
      const origin = parent.getBoundingClientRect();
      const left = origin.left + frame!.offsetLeft;
      const top = origin.top + frame!.offsetTop;
      write("--card-landing-origin-x", `${box.left + box.width / 2 - left}px`);
      write("--card-landing-origin-y", `${box.top + box.height / 2 - top}px`);
      write("--card-landing-rise", `${frame!.offsetWidth * CARD_LANDING_RISE}px`);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [cueKey]);
  return ref;
}
