import type { FreezePulse } from "../freezePulse";

const STATUS_PULSE_CLASSES: Record<FreezePulse["kind"], string> = {
  cannotAttack: "game-permanent-freeze",
  cannotBlock: "game-permanent-freeze",
  debuff: "game-permanent-debuff",
  buff: "game-permanent-buff",
};

/** The permanent wrapper's class list, one cue per standing visual state. */
export function permanentClassName({
  shake,
  freezePulse,
  effectSource,
  effectLinked,
  candidate,
  picked,
  threatened,
}: {
  shake?: boolean;
  freezePulse?: FreezePulse;
  effectSource?: boolean;
  effectLinked?: boolean;
  candidate?: boolean;
  picked?: boolean;
  threatened?: boolean;
}): string {
  return [
    "game-permanent",
    shake ? "game-permanent-shake" : "",
    freezePulse ? STATUS_PULSE_CLASSES[freezePulse.kind] : "",
    effectSource ? "game-permanent--effect-source" : "",
    effectLinked ? "game-permanent--effect-linked" : "",
    candidate ? "game-permanent--candidate" : "",
    picked ? "game-permanent--picked" : "",
    threatened ? "game-permanent--threatened" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
