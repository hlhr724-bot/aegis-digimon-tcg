import type { DecisionRequest, Permanent } from "@aegis/shared";
import type { CandidateZone } from "../../decisionModel";

export interface SourceHostChoice {
  /** The Digimon holding at least one offered card, in battle-area order. */
  hostPermanentIds: string[];
  /** The offered cards under each host. */
  cardIdsByHost: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Whether a dialog pick should first ask which Digimon to look under.
 *
 * Source selections first pick their host on either battle area, then show that host's
 * offered cards. The server's candidate list remains the authority for which sources
 * can be selected, including when the player chooses cards across several stacks.
 */
export function sourceHostChoiceFor({
  decision,
  answerOnBoard,
  candidates,
  battleArea,
}: {
  decision: DecisionRequest | undefined;
  answerOnBoard: boolean;
  candidates: readonly { instanceId: string; zone?: CandidateZone }[];
  battleArea: readonly Permanent[];
}): SourceHostChoice | undefined {
  if (decision === undefined || answerOnBoard) return undefined;
  if (decision.kind !== "selectCards" && decision.kind !== "chooseTargets") return undefined;
  if (
    candidates.length === 0 ||
    candidates.some(
      (candidate) => candidate.zone !== "digivolutionCards" && candidate.zone !== "opponentDigivolutionCards",
    )
  )
    return undefined;
  const cardIdsByHost = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const host = battleArea.find((permanent) =>
      permanent.stack.some((card) => card.instanceId === candidate.instanceId),
    );
    if (host === undefined) return undefined;
    const cards = cardIdsByHost.get(host.permanentId) ?? new Set<string>();
    cards.add(candidate.instanceId);
    cardIdsByHost.set(host.permanentId, cards);
  }
  const hostPermanentIds = battleArea
    .map((permanent) => permanent.permanentId)
    .filter((permanentId) => cardIdsByHost.has(permanentId));
  return { hostPermanentIds, cardIdsByHost };
}
