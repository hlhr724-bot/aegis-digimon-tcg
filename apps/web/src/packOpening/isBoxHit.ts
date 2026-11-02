import { BoxHit } from "@/packOpening/BoxHit";

const VALUES = new Set<string>(Object.values(BoxHit).map((entry) => entry.value));

export function isBoxHit(value: unknown): value is BoxHit {
  return typeof value === "string" && VALUES.has(value);
}
