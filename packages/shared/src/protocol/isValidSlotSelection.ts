import type { DecisionSelectionSlot } from "#shared/protocol/DecisionSelectionSlot";

type Params = {
  slots: readonly DecisionSelectionSlot[];
  selections: readonly (readonly string[])[];
};

export function isValidSlotSelection({ slots, selections }: Params): boolean {
  if (selections.length !== slots.length) {
    return false;
  }
  const taken = new Set<string>();
  for (const [index, slot] of slots.entries()) {
    const picks = selections[index]!;
    const available = slot.candidateInstanceIds.filter((instanceId) => !taken.has(instanceId));
    const minimum = slot.isMandatory ? Math.min(slot.max, available.length) : 0;
    if (picks.length < minimum || picks.length > slot.max || new Set(picks).size !== picks.length) {
      return false;
    }
    if (picks.some((instanceId) => !available.includes(instanceId))) {
      return false;
    }
    for (const instanceId of picks) {
      taken.add(instanceId);
    }
  }
  return true;
}
