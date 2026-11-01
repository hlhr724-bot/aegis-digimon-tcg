import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { ArenaActivity } from "@/game/arena3d/ArenaActivity";

type Props = {
  automatic: boolean;
  canDowngrade: boolean;
  activity: RefObject<ArenaActivity>;
  onDowngrade: () => void;
  onContextLost: () => void;
};

const WARMUP_MILLISECONDS = 2500;
const MAX_CALIBRATION_MILLISECONDS = 7000;
const CALIBRATION_EXTENSION_MILLISECONDS = 100;
const SAMPLE_FRAMES = 90;
const SLOW_FRAME_MILLISECONDS = 24;
const STALL_FRAME_GAP_MILLISECONDS = 250;

function findMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function ArenaQualityGovernor({ automatic, canDowngrade, activity, onDowngrade, onContextLost }: Props) {
  const gl = useThree((state) => state.gl);
  const samples = useRef<number[]>([]);
  const lastBusyFrame = useRef<number | undefined>(undefined);
  const startedAt = useRef(performance.now());
  const calibrationStartedAt = useRef<number | undefined>(undefined);
  const calibrationJudged = useRef(false);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    canvas.addEventListener("webglcontextlost", handleLost);
    return () => canvas.removeEventListener("webglcontextlost", handleLost);
  }, [gl, onContextLost]);

  useFrame(() => {
    const now = performance.now();
    if (!automatic || !canDowngrade || now - startedAt.current < WARMUP_MILLISECONDS) {
      lastBusyFrame.current = undefined;
      return;
    }
    if (calibrationStartedAt.current === undefined) {
      calibrationStartedAt.current = now;
      calibrationJudged.current = false;
    }
    if (!calibrationJudged.current && now - calibrationStartedAt.current < MAX_CALIBRATION_MILLISECONDS) {
      activity.current.busyUntil = Math.max(activity.current.busyUntil, now + CALIBRATION_EXTENSION_MILLISECONDS);
    }
    const previous = lastBusyFrame.current;
    const busy = now < activity.current.busyUntil;
    lastBusyFrame.current = busy ? now : undefined;
    if (!busy || previous === undefined) {
      return;
    }
    const gap = now - previous;
    if (gap > STALL_FRAME_GAP_MILLISECONDS) {
      return;
    }
    samples.current.push(gap);
    if (samples.current.length < SAMPLE_FRAMES) {
      return;
    }
    const median = findMedian(samples.current);
    samples.current = [];
    calibrationJudged.current = true;
    if (median > SLOW_FRAME_MILLISECONDS) {
      startedAt.current = now;
      calibrationStartedAt.current = undefined;
      lastBusyFrame.current = undefined;
      onDowngrade();
    }
  });

  return null;
}
