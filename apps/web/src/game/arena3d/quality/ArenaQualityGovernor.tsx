import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import { ArenaCadenceVerdict } from "@/game/arena3d/quality/ArenaCadenceVerdict";
import type { ArenaFrameRateRecovery } from "@/game/arena3d/quality/ArenaFrameRateRecovery";
import { countArenaRenderLateFrames } from "@/game/arena3d/quality/countArenaRenderLateFrames";
import { createArenaLongTaskLog } from "@/game/arena3d/quality/createArenaLongTaskLog";
import { ARENA_CADENCE_WINDOW_FRAMES, judgeArenaFrameCadence } from "@/game/arena3d/quality/judgeArenaFrameCadence";
import {
  ARENA_FRAME_RATE_RECOVERY,
  shouldRestoreArenaFrameRate,
} from "@/game/arena3d/quality/shouldRestoreArenaFrameRate";

type Props = {
  automatic: boolean;
  canDowngrade: boolean;
  lowestTier: boolean;
  frameRate: number;
  activity: RefObject<ArenaActivity>;
  onDowngrade: () => void;
  onContextLost: () => void;
};

type CadenceWindow = {
  startedAt: number;
  renderedFrames: number;
};

const WARMUP_MILLISECONDS = 2500;

export function ArenaQualityGovernor({
  automatic,
  canDowngrade,
  lowestTier,
  frameRate,
  activity,
  onDowngrade,
  onContextLost,
}: Props) {
  const gl = useThree((state) => state.gl);
  const cadenceWindow = useRef<CadenceWindow | undefined>(undefined);
  const recovery = useRef<ArenaFrameRateRecovery | undefined>(undefined);
  const longTasks = useMemo(createArenaLongTaskLog, []);

  useEffect(() => () => longTasks.dispose(), [longTasks]);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    canvas.addEventListener("webglcontextlost", handleLost);
    return () => canvas.removeEventListener("webglcontextlost", handleLost);
  }, [gl, onContextLost]);

  useEffect(() => {
    cadenceWindow.current = undefined;
    recovery.current = undefined;
  }, [automatic, frameRate]);

  useFrame(() => {
    const now = performance.now();
    const scene = activity.current;
    cadenceWindow.current ??= { startedAt: now + WARMUP_MILLISECONDS, renderedFrames: 0 };
    const current = cadenceWindow.current;
    if (now < current.startedAt) {
      current.renderedFrames = scene.renderedFrames;
      return;
    }
    const frames = scene.renderedFrames - current.renderedFrames;
    if (frames < ARENA_CADENCE_WINDOW_FRAMES) {
      return;
    }
    const lateFrames = countArenaRenderLateFrames({
      gaps: scene.lateGaps,
      since: current.startedAt,
      overlapsLongTask: longTasks.overlaps,
    });
    const target = Math.min(frameRate, scene.frameRateCap);
    const verdict = judgeArenaFrameCadence({
      frames,
      lateFrames,
      frameRate: target,
      canDowngrade: automatic && canDowngrade,
      lowestTier,
    });
    if (verdict === ArenaCadenceVerdict.KEEP.value) {
      cadenceWindow.current = { startedAt: now, renderedFrames: scene.renderedFrames };
      if (target < frameRate && shouldRestoreArenaFrameRate({ recovery: recovery.current, now, frames, lateFrames })) {
        const restored = target * 2;
        scene.frameRateCap = restored >= frameRate ? Number.POSITIVE_INFINITY : restored;
        const previous = recovery.current!;
        recovery.current = {
          ...previous,
          delayMilliseconds: previous.delayMilliseconds * 2,
          attempts: previous.attempts + 1,
        };
      }
      return;
    }
    cadenceWindow.current = undefined;
    if (verdict === ArenaCadenceVerdict.HALVE_FRAME_RATE.value) {
      scene.frameRateCap = target / 2;
      recovery.current = {
        cappedAt: now,
        delayMilliseconds: recovery.current?.delayMilliseconds ?? ARENA_FRAME_RATE_RECOVERY.firstDelayMilliseconds,
        attempts: recovery.current?.attempts ?? 0,
      };
      return;
    }
    onDowngrade();
  });

  return null;
}
