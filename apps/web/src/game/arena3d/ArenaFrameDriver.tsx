import { useEffect, useRef, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import { ArenaFrameVerdict } from "@/game/arena3d/ArenaFrameVerdict";
import { createArenaFramePacer } from "@/game/arena3d/createArenaFramePacer";
import { cardZoomPresence } from "@/game/overlay/viewer/cardZoomPresence";

type Props = {
  activity: RefObject<ArenaActivity>;
  frameRate: number;
  reducedMotion: boolean;
};

const MAX_LATE_GAPS = 240;

type Settings = {
  frameRate: number;
  reducedMotion: boolean;
};

export function ArenaFrameDriver({ activity, frameRate, reducedMotion }: Props) {
  const get = useThree((state) => state.get);
  const set = useThree((state) => state.set);
  const settings = useRef<Settings>({ frameRate, reducedMotion });

  useEffect(() => {
    settings.current = { frameRate, reducedMotion };
  }, [frameRate, reducedMotion]);

  useEffect(() => {
    const { clock } = get();
    clock.autoStart = false;
    clock.stop();
    const pacer = createArenaFramePacer();
    let lastRenderAt: number | undefined;
    const previousInvalidate = get().invalidate;
    let dirty = true;
    let origin: number | undefined;
    let frame = 0;
    set({
      invalidate: () => {
        dirty = true;
      },
    });
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      origin ??= now;
      const scene = activity.current;
      const verdict = pacer.decideFrame({
        now,
        frameRate: Math.min(settings.current.frameRate, scene.frameRateCap),
        animating: !settings.current.reducedMotion || dirty || now < scene.busyUntil || now < scene.pacedUntil,
        paused: cardZoomPresence.isOpen(),
      });
      if (verdict === ArenaFrameVerdict.SKIP.value) {
        return;
      }
      dirty = false;
      scene.renderedFrames += 1;
      if (verdict === ArenaFrameVerdict.LATE.value) {
        scene.lateGaps.push({ start: lastRenderAt ?? now, end: now });
        if (scene.lateGaps.length > MAX_LATE_GAPS) {
          scene.lateGaps.shift();
        }
      }
      lastRenderAt = now;
      get().advance((now - origin) / 1000, true);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      set({ invalidate: previousInvalidate });
    };
  }, [activity, get, set]);

  return null;
}
