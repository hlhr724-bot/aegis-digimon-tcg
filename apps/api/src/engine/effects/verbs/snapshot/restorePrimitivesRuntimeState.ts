import { EffectDuration } from "@aegis/shared/schema/enums";
import type { Primitives } from "#api/engine/effects/EffectContext";
import type { PrimitivesRuntimeState } from "#api/engine/effects/verbs/snapshot/PrimitivesRuntimeState";
import { getPrimitivesRuntimeState } from "#api/engine/effects/verbs/snapshot/getPrimitivesRuntimeState";
import { primitivesRuntimeContexts } from "#api/engine/effects/verbs/snapshot/primitivesRuntimeContexts";

type Params = { primitives: Primitives; state: PrimitivesRuntimeState };

export function restorePrimitivesRuntimeState({ primitives, state }: Params): void {
  getPrimitivesRuntimeState({ primitives });
  if (
    !Number.isSafeInteger(state.delayedMemorySequence) ||
    state.delayedMemorySequence < 0 ||
    !Number.isSafeInteger(state.stripSequence) ||
    state.stripSequence < 0 ||
    !(state.digiXrosZoneExpansions instanceof Map) ||
    !(state.customGrants instanceof Map)
  ) {
    throw new Error("Invalid primitives runtime state");
  }
  for (const [seat, entries] of state.digiXrosZoneExpansions) {
    if ((seat !== 0 && seat !== 1) || !Array.isArray(entries)) {
      throw new Error("Invalid DigiXros expansion state");
    }
    for (const entry of entries) {
      if (
        entry === null ||
        typeof entry !== "object" ||
        !Array.isArray(entry.zones) ||
        !entry.zones.every((zone) => typeof zone === "string") ||
        !isDuration(entry.duration) ||
        !Number.isSafeInteger(entry.activationTurnCount) ||
        entry.activationTurnCount < 0 ||
        (entry.activationTurnSeat !== 0 && entry.activationTurnSeat !== 1) ||
        (entry.perPlay !== undefined && typeof entry.perPlay !== "boolean") ||
        (entry.pendingPlayInstanceId !== undefined && typeof entry.pendingPlayInstanceId !== "string") ||
        (entry.materialLimits !== undefined &&
          (entry.materialLimits === null ||
            typeof entry.materialLimits !== "object" ||
            Object.values(entry.materialLimits).some((limit) => !Number.isSafeInteger(limit) || limit < 0)))
      ) {
        throw new Error("Invalid DigiXros expansion state");
      }
    }
  }
  for (const [id, entries] of state.customGrants) {
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      !Array.isArray(entries) ||
      entries.some(
        (entry) =>
          entry === null ||
          typeof entry !== "object" ||
          !isDuration(entry.duration) ||
          entry.grant === null ||
          typeof entry.grant !== "object" ||
          Array.isArray(entry.grant),
      )
    ) {
      throw new Error("Invalid custom primitive grant state");
    }
  }
  const context = primitivesRuntimeContexts.get(primitives)!;
  context.sequences.delayedMemorySequence = state.delayedMemorySequence;
  context.sequences.stripSequence = state.stripSequence;
  const expansions = [...state.digiXrosZoneExpansions];
  const grants = [...state.customGrants];
  context.digiXrosZoneExpansions.clear();
  for (const [seat, entries] of expansions) {
    context.digiXrosZoneExpansions.set(seat, entries);
  }
  context.customGrants.clear();
  for (const [id, entries] of grants) {
    context.customGrants.set(id, entries);
  }
}

function isDuration(value: unknown): value is EffectDuration {
  return typeof value === "number" && Object.values(EffectDuration).includes(value);
}
