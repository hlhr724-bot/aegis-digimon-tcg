import type { Permanent } from "@aegis/shared";
import type { RestrictionBadge } from "../fieldBadges";
import type { PendingFateBadge } from "../pendingFate";
import type { Translate } from "../../i18n";
import { formatDp } from "@/design/formatDp";

/**
 * The accessible name a permanent speaks when it is interactive: the card name,
 * then every standing state worth announcing (suspended, summoning-sick, the
 * server's own restriction badges, a fate an effect is about to hand it), then
 * the DP delta if one applies. A non-interactive permanent gets no label at all —
 * see `PermanentView`, which only calls this when the wrapper is a button.
 */
export function permanentAriaLabel({
  perm,
  heldSuspended,
  restrictions,
  fate,
  cardName,
  copies = 1,
  delta,
  hasDpDelta,
  t,
}: {
  perm: Pick<Permanent, "isSuspended" | "summoningSick" | "currentDP">;
  heldSuspended?: boolean;
  restrictions: readonly RestrictionBadge[];
  fate?: PendingFateBadge;
  cardName: string;
  /** Identical permanents the card stands for, itself included. */
  copies?: number;
  delta: number;
  hasDpDelta: boolean;
  t: Translate;
}): string {
  const states = [
    copies > 1 ? t("game.fieldCopies", { count: copies }) : undefined,
    heldSuspended || perm.isSuspended ? t("overlay.suspended") : undefined,
    perm.summoningSick ? t("overlay.summoningSick") : undefined,
    ...restrictions.map((restriction) => t(restriction.labelKey)),
    // The coming fate joins the spoken state list rather than labelling the pill
    // itself: a nested aria-label would rewrite the card's own accessible name.
    fate ? t(fate.labelKey) : undefined,
  ].filter((state): state is string => state !== undefined);
  const stateLabel = states.length ? ` (${states.join(", ")})` : "";
  const dpLabel = hasDpDelta
    ? `, ${perm.currentDP.toLocaleString()} DP, DP ${delta > 0 ? "+" : "−"}${formatDp(Math.abs(delta))}`
    : "";
  return `${cardName}${stateLabel}${dpLabel}`;
}
