import { ArenaPulseKind } from "@/game/arena3d/ArenaPulseKind";

export type ArenaPulseKindEntry = (typeof ArenaPulseKind)[keyof typeof ArenaPulseKind];

const ENTRIES: readonly ArenaPulseKindEntry[] = Object.values(ArenaPulseKind);

export function findArenaPulseKind(value: ArenaPulseKind): ArenaPulseKindEntry {
  return ENTRIES.find((entry) => entry.value === value) ?? ArenaPulseKind.SUMMON;
}
