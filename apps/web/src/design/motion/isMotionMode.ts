import type { MotionMode } from "@/design/motion/MotionMode";
import { motionModeValues } from "@/design/motion/motionModeValues";

const modeValues: ReadonlySet<string> = new Set(motionModeValues);

export function isMotionMode(value: unknown): value is MotionMode {
  return typeof value === "string" && modeValues.has(value);
}
