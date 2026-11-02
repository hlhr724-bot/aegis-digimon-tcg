import type { DecisionRequest, GameState, Permanent, Seat, SequencedServerEvent } from "@aegis/shared";
import { buildInstanceArtIndex } from "../../sidePanels";
import { buildInstanceZoneIndex, decisionCardColors, decisionVisibleCards } from "../../decisionModel";
import { decisionEffectSource } from "../../matchLog";
import {
  decisionPresentation,
  decisionSelectionMin,
  isFieldCardSelection,
  sourcePermanentIdOf,
} from "../../decisionPresentation";

/** The open decision as the board shows it, and where the viewer answers it. */
export type DecisionView = {
  /** The prompt, once the beats that explain it have finished; undefined until then. */
  viewerDecision: DecisionRequest | undefined;
  /** True when the answer is given by tapping the board rather than in a dialog. */
  answerOnBoard: boolean;
  /**
   * The permanent the prompt came from, or the attacker for an attack target, highlighted
   * for the whole decision, including dialogs.
   */
  decisionHighlightPermanentId: string | undefined;
  /**
   * The raised Digimon whose effect is asking. A breeding slot is never answered on the
   * board, so it stays lifted for the whole dialog instead.
   */
  decisionBreedingSourcePermanentId: string | undefined;
  /** The card whose clause is being asked about, named on the board prompt. */
  decisionSourceCardId: string | undefined;
  decisionSelectable: Set<string>;
  decisionVisible: (ReturnType<typeof decisionVisibleCards>[number] & { trashOriginCardId?: string })[];
  decisionVisibleCardIds: Map<string, string | undefined>;
  decisionInstanceColors: ReturnType<typeof decisionCardColors>;
  decisionDifferentColors: boolean;
  decisionDistinctCardIds: boolean;
  decisionDistinctNames: boolean;
  decisionAllowedTargetCombinations: readonly (readonly string[])[] | undefined;
  /** The combined printed play-cost cap sent by the engine. */
  decisionMaxTotalPlayCost: number | undefined;
  /** The summed-DP cap the engine enforces on this selection, if any. */
  decisionMaxTotalDP: number | undefined;
  /** Current DP of each board candidate, keyed by permanent and top-card id. */
  decisionCandidateDP: Map<string, number>;
  decisionMin: number;
  decisionMax: number;
};

/**
 * Everything the screen needs to render the open decision.
 *
 * All of it reads the server's decision payload; the client adds no legality of its own, it
 * only decides which surface the payload renders on. The prompt itself is revealed only after
 * the finite visual beats that explain it have finished — the security dock and the toast
 * reading do not participate in that gate.
 */
export function decisionViewFor({
  decision,
  decisionAnimationsPending,
  decisionAsDialog,
  viewerSeat,
  events,
  state,
  instanceIndex,
  permanents,
  breedingPermanents,
  handInstanceIds,
}: {
  decision: DecisionRequest | undefined;
  decisionAnimationsPending: boolean;
  /** The viewer moved a board-answered prompt into its dialog. */
  decisionAsDialog: boolean;
  viewerSeat: Seat;
  events: SequencedServerEvent[];
  state: GameState;
  instanceIndex: ReadonlyMap<string, string>;
  permanents: readonly Permanent[];
  breedingPermanents: readonly Permanent[];
  handInstanceIds: readonly string[];
}): DecisionView {
  const viewerDecision = decision && decision.seat === viewerSeat && !decisionAnimationsPending ? decision : undefined;
  const decisionSourceCardId = viewerDecision ? decisionEffectSource(viewerDecision, events) : undefined;
  const decisionSourcePermanentId = viewerDecision
    ? sourcePermanentIdOf(decisionSourceCardId, permanents, viewerDecision)
    : undefined;
  const fieldInstanceIds = permanents.flatMap((permanent) => [permanent.permanentId, permanent.topCard.instanceId]);
  const boardPresentation = viewerDecision
    ? decisionPresentation({
        decision: viewerDecision,
        handInstanceIds,
        sourcePermanentId: decisionSourcePermanentId,
        fieldInstanceIds,
      })
    : "dialog";
  const answerOnBoard =
    boardPresentation === "board" && (isFieldCardSelection(viewerDecision, fieldInstanceIds) || !decisionAsDialog);
  const trashOrigins = new Map(
    Array.from(state.players).flatMap((player) =>
      player.trash.map((card) => [card.instanceId, card.trashOriginCardId] as const),
    ),
  );
  const decisionVisible = viewerDecision
    ? decisionVisibleCards(
        viewerDecision.options,
        instanceIndex,
        buildInstanceArtIndex(state),
        buildInstanceZoneIndex(state, viewerSeat, { permanentTargets: viewerDecision.kind === "chooseTargets" }),
      ).map((candidate) => ({
        ...candidate,
        ...((candidate.zone === "trash" || candidate.zone === "opponentTrash") &&
        Boolean(trashOrigins.get(candidate.instanceId))
          ? { trashOriginCardId: trashOrigins.get(candidate.instanceId) }
          : {}),
      }))
    : [];
  return {
    viewerDecision,
    answerOnBoard,
    decisionSourceCardId,
    decisionHighlightPermanentId:
      viewerDecision?.options?.selectionContext === "attackTarget"
        ? viewerDecision.sourcePermanentId
        : decisionSourcePermanentId,
    decisionBreedingSourcePermanentId:
      viewerDecision?.kind === "optional"
        ? sourcePermanentIdOf(decisionSourceCardId, breedingPermanents, viewerDecision)
        : undefined,
    decisionSelectable: new Set(viewerDecision?.options?.candidateInstanceIds ?? []),
    decisionVisible,
    decisionVisibleCardIds: new Map(decisionVisible.map((card) => [card.instanceId, card.cardId])),
    decisionInstanceColors: decisionCardColors(decisionVisible),
    decisionDifferentColors: viewerDecision?.options?.differentColors === true,
    decisionDistinctCardIds: viewerDecision?.options?.distinctCardIds === true,
    decisionDistinctNames: viewerDecision?.options?.distinctNames === true,
    decisionAllowedTargetCombinations: viewerDecision?.options?.allowedTargetCombinations,
    decisionMaxTotalPlayCost: viewerDecision?.options?.maxTotalPlayCost,
    decisionMaxTotalDP: viewerDecision?.options?.maxTotalDP,
    decisionCandidateDP: new Map(
      permanents.flatMap((permanent) => [
        [permanent.permanentId, permanent.currentDP] as const,
        [permanent.topCard.instanceId, permanent.currentDP] as const,
      ]),
    ),
    decisionMin: decisionSelectionMin(viewerDecision),
    decisionMax: viewerDecision?.options?.max ?? 1,
  };
}
