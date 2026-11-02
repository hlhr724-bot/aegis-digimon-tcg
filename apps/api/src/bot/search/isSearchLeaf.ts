import type { GameOverReason } from "#api/engine/security/winCheck";

type ContinuationReason = GameOverReason | "rolloutCutoff" | "continuationLimit" | "stalled" | "unfinished";

const SEARCH_LEAF_REASONS: ReadonlySet<string> = new Set<ContinuationReason>([
  "rolloutCutoff",
  "security",
  "deckOut",
  "effect",
]);

export function isSearchLeaf({ valid, reason }: { valid: boolean; reason: string }): boolean {
  return valid && SEARCH_LEAF_REASONS.has(reason);
}
