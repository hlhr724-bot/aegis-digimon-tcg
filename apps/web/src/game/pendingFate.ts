/* The badge a permanent wears while an effect is deciding its fate: the small
   "will be deleted" / "back to hand" / "will unsuspend" tag the reference client
   pins to a card between a target being chosen and the effect resolving.

   The fate is server truth. `DecisionRequest.options.targetFate` is projected by
   the engine from the IR action kind that raised the prompt (`targetFateOf`,
   apps/api), so nothing here reads the prompt's English or infers an outcome from
   the board. A decision that carries no fate wears no badge.

   Pure: this module decides what the badge says, not when it is on screen. */

import type { DecisionRequest, TargetFate } from "@aegis/shared";

/** The translation key each fate prints, named per fate so a rename is caught. */
export type PendingFateLabelKey = `game.fate.${TargetFate}` | "game.fate.effectTarget";

export interface PendingFateBadge {
  fate: TargetFate | "effectTarget";
  /** Translation key for the badge's short label. */
  labelKey: PendingFateLabelKey;
  /** The glyph printed ahead of the label; matches the sense of the fate. */
  glyph: string;
  /** Which of the board's three badge tones the badge paints in. */
  tone: "danger" | "neutral" | "good";
}

/* The three tones are the reference client's own three pill colours: the magenta
   it deletes in, the blue it moves cards in, and the white it digivolves in. */
const FATE_BADGES = {
  delete: { labelKey: "game.fate.delete", glyph: "✕", tone: "danger" },
  trash: { labelKey: "game.fate.trash", glyph: "✕", tone: "danger" },
  returnToHand: { labelKey: "game.fate.returnToHand", glyph: "↩", tone: "neutral" },
  returnToDeck: { labelKey: "game.fate.returnToDeck", glyph: "↩", tone: "neutral" },
  returnToEggDeck: { labelKey: "game.fate.returnToEggDeck", glyph: "↩", tone: "neutral" },
  suspend: { labelKey: "game.fate.suspend", glyph: "⟳", tone: "neutral" },
  unsuspend: { labelKey: "game.fate.unsuspend", glyph: "⟲", tone: "neutral" },
  digivolve: { labelKey: "game.fate.digivolve", glyph: "▲", tone: "good" },
} as const satisfies Record<TargetFate, Omit<PendingFateBadge, "fate">>;

/** How a fate reads on a badge. */
export function pendingFateBadge(fate: TargetFate): PendingFateBadge {
  return { fate, ...FATE_BADGES[fate] };
}

/**
 * The badge each permanent wears for the decision currently open, by permanent id.
 *
 * Only the targets the viewer has actually picked are badged: a candidate is a
 * card the effect *could* reach, and pinning "will be deleted" to every one of
 * them would say something the server never said. Empty whenever the decision is
 * not a target prompt, carries no projected fate, or belongs to the other seat.
 */
export function pendingFateBadges({
  decision,
  picks,
  viewerSeat,
  wouldBeDeletedPermanentIds = [],
}: {
  decision: DecisionRequest | undefined;
  picks: readonly string[];
  viewerSeat: number;
  wouldBeDeletedPermanentIds?: readonly string[];
}): ReadonlyMap<string, PendingFateBadge> {
  if (wouldBeDeletedPermanentIds.length > 0) {
    return new Map(wouldBeDeletedPermanentIds.map((id) => [id, pendingFateBadge("delete")]));
  }
  if (!decision || decision.seat !== viewerSeat) return new Map();
  if (decision.options?.affectedPermanentIds?.length) {
    const badge: PendingFateBadge = {
      fate: "effectTarget",
      labelKey: "game.fate.effectTarget",
      glyph: "⌖",
      tone: "danger",
    };
    return new Map(decision.options.affectedPermanentIds.map((id) => [id, badge]));
  }
  if (decision.kind !== "chooseTargets") return new Map();
  const fate = decision.options?.targetFate;
  if (fate === undefined) return new Map();
  const candidates = new Set(decision.options?.candidateInstanceIds ?? []);
  const badge = pendingFateBadge(fate);
  const badges = new Map<string, PendingFateBadge>();
  for (const id of picks) if (candidates.has(id)) badges.set(id, badge);
  return badges;
}
