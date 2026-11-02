import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";
import { ArenaCadenceVerdict } from "@/game/arena3d/quality/ArenaCadenceVerdict";
import { ARENA_CADENCE_WINDOW_FRAMES, judgeArenaFrameCadence } from "@/game/arena3d/quality/judgeArenaFrameCadence";

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
  lateFrames: number;
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
  }, [automatic, frameRate]);

  useFrame(() => {
    const now = performance.now();
    const scene = activity.current;
    cadenceWindow.current ??= { startedAt: now + WARMUP_MILLISECONDS, renderedFrames: 0, lateFrames: 0 };
    const current = cadenceWindow.current;
    if (now < current.startedAt) {
      current.renderedFrames = scene.renderedFrames;
      current.lateFrames = scene.lateFrames;
      return;
    }
    const frames = scene.renderedFrames - current.renderedFrames;
    if (frames < ARENA_CADENCE_WINDOW_FRAMES) {
      return;
    }
    const target = Math.min(frameRate, scene.frameRateCap);
    const verdict = judgeArenaFrameCadence({
      frames,
      lateFrames: scene.lateFrames - current.lateFrames,
      frameRate: target,
      canDowngrade: automatic && canDowngrade,
      lowestTier,
    });
    if (verdict === ArenaCadenceVerdict.KEEP.value) {
      cadenceWindow.current = { startedAt: now, renderedFrames: scene.renderedFrames, lateFrames: scene.lateFrames };
      return;
    }
    cadenceWindow.current = undefined;
    if (verdict === ArenaCadenceVerdict.HALVE_FRAME_RATE.value) {
      scene.frameRateCap = target / 2;
      return;
    }
    onDowngrade();
  });

  return null;
}
