import type { ArenaFieldEffectMark } from "@/game/arena3d/slots/ArenaFieldEffectMark";
import type { ArenaFieldEffectTone } from "@/game/arena3d/slots/ArenaFieldEffectTone";

export type ArenaFieldEffectState = {
  tone: ArenaFieldEffectTone;
  marks: readonly ArenaFieldEffectMark[];
  signature: string;
};
