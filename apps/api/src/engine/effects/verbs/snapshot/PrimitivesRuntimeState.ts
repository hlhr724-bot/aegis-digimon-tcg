import type { PrimitivesContext } from "#api/engine/effects/verbs/context";

export type PrimitivesRuntimeState = {
  delayedMemorySequence: number;
  stripSequence: number;
  digiXrosZoneExpansions: PrimitivesContext["digiXrosZoneExpansions"];
  customGrants: PrimitivesContext["customGrants"];
};
