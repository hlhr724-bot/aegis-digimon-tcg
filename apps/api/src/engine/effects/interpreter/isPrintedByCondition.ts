import type { Cost } from "@aegis/shared";

export function isPrintedByCondition(cost: Cost | number | undefined): boolean {
  return typeof cost === "object" && /^\s*by\b/i.test(cost.raw ?? "");
}
