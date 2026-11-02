import { ArenaFieldEffectTone } from "@/game/arena3d/slots/ArenaFieldEffectTone";

export type ArenaFieldEffectToneEntry = (typeof ArenaFieldEffectTone)[keyof typeof ArenaFieldEffectTone];

const ENTRIES: readonly ArenaFieldEffectToneEntry[] = Object.values(ArenaFieldEffectTone);

export function findArenaFieldEffectTone(value: ArenaFieldEffectTone): ArenaFieldEffectToneEntry {
  return ENTRIES.find((entry) => entry.value === value) ?? ArenaFieldEffectTone.NONE;
}
