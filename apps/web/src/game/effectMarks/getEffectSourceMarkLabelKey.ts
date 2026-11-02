import { EffectSourceMark } from "@/game/effectMarks/EffectSourceMark";

export function getEffectSourceMarkLabelKey(mark: EffectSourceMark) {
  if (mark === EffectSourceMark.RESOLVING.value) {
    return EffectSourceMark.RESOLVING.labelKey;
  }
  return EffectSourceMark.PENDING.labelKey;
}
