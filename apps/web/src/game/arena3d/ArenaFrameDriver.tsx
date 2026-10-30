import { useEffect, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";

type Props = {
  activity: RefObject<ArenaActivity>;
};

const IDLE_FRAME_INTERVAL_MS = 1000 / 30;

export function ArenaFrameDriver({ activity }: Props) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    let frame = 0;
    let lastIdleFrame = 0;
    const tick = (now: number) => {
      const busy = now < activity.current.busyUntil;
      if (busy || now - lastIdleFrame >= IDLE_FRAME_INTERVAL_MS) {
        lastIdleFrame = now;
        invalidate();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activity, invalidate]);

  return null;
}
