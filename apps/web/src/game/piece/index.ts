/* Board sub-components — piles, permanents, breeding slot, memory gauge, hand,
   attack arrow. Presentational; they read real Permanent / count data and take
   interaction handlers (click / drop zones / pointer-drag) as props.

   Each piece now has its own file under ./piece, with the geometry and label
   maths beside them as pure functions. This file is the entry point they are
   still imported through. */

export { HAND_CARD_WIDTH, HAND_CARD_WIDTH_COMPACT, HAND_MIN_EXPOSURE_TOUCH } from "./constants";
export type { ArrowPoint, DropAttrs, HandEntry, HandSelection, ScrollOverflow } from "./types";

export { buildShieldShards } from "./shieldShards";
export { handOverlap } from "./handLayout";
export { MEMORY_SWEEP_CHIP_MS, MEMORY_SWEEP_MS, traversedChips } from "./memoryChips";
export { useElementWidth } from "./useElementWidth";
export { useScrollOverflow } from "./useScrollOverflow";

export { AttackArrow } from "./AttackArrow";
export { BoardInputLock } from "./BoardInputLock";
export { BreedingSlot } from "./BreedingSlot";
export { ClawSlash } from "./ClawSlash";
export { DpPulseParticles } from "./DpPulseParticles";
export { Hand } from "./Hand";
export { MemoryArc } from "./MemoryArc";
export { MemoryGauge } from "./MemoryGauge";
export { MemoryPredictionArc } from "./MemoryPredictionArc";
export { PermanentView } from "./PermanentView";
export { Pile } from "./Pile";
export { TurnControl } from "./TurnControl";
