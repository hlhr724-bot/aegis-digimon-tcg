import type { FieldEffectView } from "@aegis/shared";
import type { ArenaFieldEffectMark } from "@/game/arena3d/slots/ArenaFieldEffectMark";
import type { ArenaFieldEffectState } from "@/game/arena3d/slots/ArenaFieldEffectState";
import { ArenaFieldEffectTone } from "@/game/arena3d/slots/ArenaFieldEffectTone";
import { isHarmfulFieldEffect } from "@/game/isHarmfulFieldEffect";

function buildMark(effect: FieldEffectView): ArenaFieldEffectMark {
  const key = [
    effect.kind,
    effect.value,
    effect.amount ?? "",
    effect.sourceCardId ?? "",
    effect.duration,
    effect.ownerSeat,
  ].join(":");
  return { key, harmful: isHarmfulFieldEffect(effect) };
}

function getTone(marks: readonly ArenaFieldEffectMark[]): ArenaFieldEffectTone {
  if (marks.length === 0) {
    return ArenaFieldEffectTone.NONE.value;
  }
  if (marks.some((mark) => mark.harmful)) {
    return ArenaFieldEffectTone.HARMFUL.value;
  }
  return ArenaFieldEffectTone.HELPFUL.value;
}

export function summarizeArenaFieldEffects(effects: readonly FieldEffectView[]): ArenaFieldEffectState {
  const marks = effects.map(buildMark);
  return {
    tone: getTone(marks),
    marks,
    signature: marks.map((mark) => mark.key).join("|"),
  };
}
