import { useEffect, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import { cardZoomPresence } from "@/game/overlay/viewer/cardZoomPresence";

type Props = {
  activity: RefObject<ArenaActivity>;
  idleFrameRate: number;
  pacedFrameRate: number;
};

const FRAME_JITTER_MILLISECONDS = 4;

function getFrameGap(frameRate: number): number {
  return 1000 / frameRate - FRAME_JITTER_MILLISECONDS;
}

export function ArenaFrameDriver({ activity, idleFrameRate, pacedFrameRate }: Props) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const idleGap = getFrameGap(idleFrameRate);
    const pacedGap = getFrameGap(Math.max(idleFrameRate, pacedFrameRate));
    let frame = 0;
    let lastFrame = 0;
    const tick = (now: number) => {
      const { busyUntil, pacedUntil } = activity.current;
      const gap = now < busyUntil ? 0 : now < pacedUntil ? pacedGap : idleGap;
      if (now - lastFrame >= gap && !cardZoomPresence.isOpen()) {
        lastFrame = now;
        invalidate();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activity, idleFrameRate, pacedFrameRate, invalidate]);

  return null;
}
