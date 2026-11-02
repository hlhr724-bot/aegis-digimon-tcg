import type { TranslationKey } from "@/i18n/translationTypes";
import { MotionMode } from "@/design/motion/MotionMode";

const labelKeys = new Map<MotionMode, TranslationKey>(
  Object.values(MotionMode).map((mode) => [mode.value, mode.labelKey]),
);

export function motionModeLabelKey(mode: MotionMode): TranslationKey {
  return labelKeys.get(mode) ?? MotionMode.SYSTEM.labelKey;
}
