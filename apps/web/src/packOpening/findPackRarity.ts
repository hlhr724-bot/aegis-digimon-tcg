import { PackRarity } from "@/packOpening/PackRarity";

type PackRarityEntry = (typeof PackRarity)[keyof typeof PackRarity];

export function findPackRarity(value: unknown): PackRarityEntry | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return Object.values(PackRarity).find((entry) => entry.value === value);
}
