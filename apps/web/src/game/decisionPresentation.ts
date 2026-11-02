/* Which surface a pending decision is answered on, and the small pieces of text
   that surface needs. All pure: the server still owns every rule, this module
   chooses a left action rail or a central card dialog and formats labels for the trigger
   chooser.

   The dialog is the fallback for everything, so a decision shape this module has
   not been taught about still renders. */

import type { DecisionRequest, Permanent } from "@aegis/shared";

export type DecisionPresentation = "board" | "dialog";

/** Every offered card is already a physical permanent on the battle areas. */
export function isFieldCardSelection(
  decision: DecisionRequest | undefined,
  fieldInstanceIds: readonly string[],
): boolean {
  if (decision?.kind !== "selectCards" && decision?.kind !== "chooseTargets") return false;
  const options = decision.options;
  if (
    options?.assemblyCardId !== undefined ||
    options?.digiXrosCardId !== undefined ||
    options?.selectionContext === "partitionActivation" ||
    options?.selectionContext === "materialSaveActivation"
  )
    return false;
  const candidates = options?.candidateInstanceIds ?? [];
  const visible = options?.visibleInstanceIds ?? candidates;
  const field = new Set(fieldInstanceIds);
  return candidates.length > 0 && candidates.every((id) => field.has(id)) && visible.every((id) => field.has(id));
}

/** The effect is asking for field targets, rather than a cost, zone card, or attack declaration. */
export function isFieldTargetDecision(decision: DecisionRequest, permanents: readonly Permanent[]): boolean {
  if (decision.kind !== "chooseTargets" && decision.kind !== "selectCards") return false;
  if (decision.options?.purpose === "cost" || decision.options?.selectionContext !== undefined) return false;
  const candidates = decision.options?.candidateInstanceIds ?? [];
  const field = new Set(permanents.flatMap((permanent) => [permanent.permanentId, permanent.topCard?.instanceId]));
  return candidates.length > 0 && candidates.every((id) => field.has(id));
}

/** The engine's dedicated optional Decoy sacrifice question, not any effect mentioning the keyword. */
export function isDecoyDecision(decision: DecisionRequest | undefined): boolean {
  return decision?.kind === "selectCards" && /^[＜<]\s*Decoy(?:\s*[＞>]|\s*\()/i.test(decision.promptText ?? "");
}

/** Hand and field selections are answered on their physical cards.
 * Other card selections retain the central dialog and its revealed context.
 * Optional activations use the preferred surface; field targets remain on the board.
 * Unknown decisions retain the dialog fallback.
 */
export function decisionPresentation({
  decision,
  handInstanceIds,
  sourcePermanentId,
  fieldInstanceIds = [],
}: {
  decision: DecisionRequest;
  handInstanceIds: readonly string[];
  sourcePermanentId?: string;
  fieldInstanceIds?: readonly string[];
}): DecisionPresentation {
  if (isFieldCardSelection(decision, fieldInstanceIds)) return "board";
  if (decision.kind === "selectCards" || decision.kind === "chooseTargets") {
    const options = decision.options;
    const candidates = options?.candidateInstanceIds ?? [];
    const hand = new Set(handInstanceIds);
    const visible = options?.visibleInstanceIds ?? candidates;
    const material = options?.assemblyCardId !== undefined || options?.digiXrosCardId !== undefined;
    if (
      !material &&
      options?.selectionContext !== "partitionActivation" &&
      options?.selectionContext !== "materialSaveActivation" &&
      options?.selectionContext !== "attackTarget" &&
      candidates.length > 0 &&
      candidates.every((id) => hand.has(id)) &&
      visible.every((id) => hand.has(id))
    )
      return "board";
  }
  return decision.kind === "optional" && sourcePermanentId !== undefined && !isEffectActivationDecision(decision)
    ? "board"
    : "dialog";
}

export function isEffectActivationDecision(decision: DecisionRequest): boolean {
  if (decision.options?.purpose === "cost" || decision.options?.digivolveCostChoice !== undefined) return false;
  return (
    decision.kind === "optional" ||
    decision.kind === "chooseOption" ||
    decision.options?.selectionContext === "partitionActivation" ||
    decision.options?.selectionContext === "materialSaveActivation"
  );
}

const CARD_GALLERY_DECISION_KINDS: readonly DecisionRequest["kind"][] = [
  "chooseTargets",
  "selectCards",
  "orderCards",
  "orderTriggers",
  "mulligan",
];

export function effectDecisionSurface(
  decision: DecisionRequest,
  position: "left" | "center" = "left",
): "left" | "center" {
  if (isEffectActivationDecision(decision)) {
    return position;
  }
  if (CARD_GALLERY_DECISION_KINDS.includes(decision.kind)) {
    return "center";
  }
  return position;
}

/**
 * The permanent a pending decision's source card is sitting on, so the board
 * prompt can highlight it. Physical source identity also locates effects buried
 * in a digivolution stack; older requests fall back to the face-up card code.
 */
export function sourcePermanentIdOf(
  sourceCardId: string | undefined,
  permanents: readonly Permanent[],
  source?: { sourceInstanceId?: string; sourcePermanentId?: string },
): string | undefined {
  if (source?.sourcePermanentId) {
    return permanents.find((permanent) => permanent.permanentId === source.sourcePermanentId)?.permanentId;
  }
  if (source?.sourceInstanceId) {
    return permanents.find((permanent) =>
      [permanent.topCard, ...(permanent.stack ?? []), ...(permanent.linked ?? [])].some(
        (card) => card?.instanceId === source.sourceInstanceId,
      ),
    )?.permanentId;
  }
  if (sourceCardId === undefined) return undefined;
  return permanents.find((permanent) => permanent.topCard?.cardId === sourceCardId)?.permanentId;
}

/** How much of a printed clause fits on one line under a trigger chooser card. */
export const TRIGGER_SUMMARY_MAX_CHARS = 64;

/**
 * One-line summary of a printed clause for the trigger chooser. Drops the timing
 * brackets (the card already carries its own source label) and truncates on a
 * word boundary so a clipped summary never ends mid-word.
 */
export function triggerClauseSummary(
  clause: string | undefined,
  maxChars: number = TRIGGER_SUMMARY_MAX_CHARS,
): string | undefined {
  const stripped = clause
    ?.replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return undefined;
  if (stripped.length <= maxChars) return stripped;
  const head = stripped.slice(0, maxChars);
  const lastSpace = head.lastIndexOf(" ");
  const cut = lastSpace > maxChars / 2 ? head.slice(0, lastSpace) : head;
  return `${cut.replace(/[,.;:]$/, "")}…`;
}

/** Mirror the server's shortage rule using the offered candidates, including hidden ones. */
export function decisionSelectionMin(decision: DecisionRequest | undefined): number {
  const min = decision?.options?.min ?? 1;
  if (decision?.kind !== "selectCards" && decision?.kind !== "chooseTargets") return min;
  return Math.min(min, new Set(decision.options?.candidateInstanceIds ?? []).size);
}
