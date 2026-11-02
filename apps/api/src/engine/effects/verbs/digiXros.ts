import { type ZoneRef } from "@aegis/shared";
import type { Primitives } from "../EffectContext.js";

import type { PrimitivesContext } from "./context.js";

/**
 * ＜DigiXros＞ zone expansion: which extra zones a seat may pay materials from,
 * and for how long.
 */

export function createDigiXrosVerbs(pc: PrimitivesContext) {
  const { activeDigiXrosExpansions, addDigiXrosExpansion, digiXrosZoneExpansions } = pc;

  const digiXrosExpandedZones: Primitives["digiXrosExpandedZones"] = (seat, pendingPlayInstanceId) => {
    const active = activeDigiXrosExpansions(seat);
    return [
      ...new Set(
        active
          .filter(
            (entry) =>
              entry.perPlay !== true ||
              pendingPlayInstanceId === undefined ||
              entry.pendingPlayInstanceId === pendingPlayInstanceId,
          )
          .flatMap((entry) => entry.zones),
      ),
    ];
  };
  const digiXrosExpandedZoneCounts: NonNullable<Primitives["digiXrosExpandedZoneCounts"]> = (
    seat,
    pendingPlayInstanceId,
  ) => {
    const counts: Partial<Record<ZoneRef, number>> = {};
    for (const entry of activeDigiXrosExpansions(seat)) {
      if (
        entry.perPlay === true &&
        pendingPlayInstanceId !== undefined &&
        entry.pendingPlayInstanceId !== pendingPlayInstanceId
      )
        continue;
      for (const zone of entry.zones) counts[zone] = (counts[zone] ?? 0) + (entry.materialLimits?.[zone] ?? 1);
    }
    return counts;
  };
  const digiXrosPlayExpansionCount: NonNullable<Primitives["digiXrosPlayExpansionCount"]> = (
    seat,
    pendingPlayInstanceId,
  ) =>
    activeDigiXrosExpansions(seat).filter(
      (entry) =>
        entry.perPlay === true &&
        (pendingPlayInstanceId === undefined || entry.pendingPlayInstanceId === pendingPlayInstanceId),
    ).length;
  const expandDigiXrosZones: Primitives["expandDigiXrosZones"] = (seat, zones, duration) =>
    addDigiXrosExpansion(seat, zones, duration);
  const expandDigiXrosZonesForPlay: Primitives["expandDigiXrosZonesForPlay"] = (
    seat,
    zones,
    duration,
    pendingPlayInstanceId,
    materialLimits,
  ) => addDigiXrosExpansion(seat, zones, duration, true, pendingPlayInstanceId, materialLimits);
  const consumeDigiXrosPlayExpansions: Primitives["consumeDigiXrosPlayExpansions"] = (seat, pendingPlayInstanceId) => {
    const remaining = (digiXrosZoneExpansions.get(seat) ?? []).filter(
      (entry) =>
        entry.perPlay !== true ||
        (pendingPlayInstanceId !== undefined && entry.pendingPlayInstanceId !== pendingPlayInstanceId),
    );
    if (remaining.length === 0) digiXrosZoneExpansions.delete(seat);
    else digiXrosZoneExpansions.set(seat, remaining);
  };

  // Engine-backed: re-activate one of a permanent's own [On Play] effects (EX3-065). Needs the
  // effect-collection + stack the engine owns, so it delegates to the engine hook.

  return {
    digiXrosExpandedZones,
    digiXrosExpandedZoneCounts,
    digiXrosPlayExpansionCount,
    expandDigiXrosZones,
    expandDigiXrosZonesForPlay,
    consumeDigiXrosPlayExpansions,
  };
}
