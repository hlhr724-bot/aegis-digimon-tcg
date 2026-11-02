import { PackOpeningPhase } from "@/packOpening/PackOpeningPhase";

type PackOpeningPhaseEntry = (typeof PackOpeningPhase)[keyof typeof PackOpeningPhase];

export function findPackOpeningPhase(value: PackOpeningPhase): PackOpeningPhaseEntry {
  return Object.values(PackOpeningPhase).find((entry) => entry.value === value) ?? PackOpeningPhase.CHOOSING;
}
