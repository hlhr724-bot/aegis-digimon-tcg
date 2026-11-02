import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { isAllowedTargetSelection } from "@/game/screen/model/isAllowedTargetSelection";
/* The viewer's open decision, in whichever surface answers it.

   Field targets use the physical cards and a confirmation rail. Selections from other
   zones use the dialog, after choosing any digivolution-card host on the field. */

import {
  assemblyRequirementFor,
  digiXrosRequirementFor,
  type DecisionRequest,
  type DecisionResponse,
  type Permanent,
} from "@aegis/shared";
import { useTranslation } from "../../../i18n";
import { BoardOptionalPrompt, BoardSelectionRail, BoardSourceHostPrompt } from "../../BoardDecisionRail";

import { decisionPermanentDetails, decisionSourceCounts, type CandidateZone } from "../../decisionModel";
import { attackTargetPrompt } from "../model/attackTargetPrompt";
import {
  AssemblyMaterialOverlay,
  DecisionOverlay,
  DigiXrosMaterialOverlay,
  playerFacingEffectClause,
  playerFacingPromptText,
} from "../../overlay";
import type { DigiXrosCandidate, TriggerDetail } from "../../overlay";
import { totalPlayCost } from "../../overlay/choice/decisionPlayCost";
import { totalDP } from "../../overlay/choice/decisionDpBudget";

/**
 * A pick from several Digimon's digivolution cards: the viewer picks the Digimon
 * on the field first (`picking`), then the dialog shows only the cards under it.
 */
export interface SourceHostStep {
  picking: boolean;
  /** The offered cards under the chosen Digimon; undefined while `picking`. */
  cardIds: ReadonlySet<string> | undefined;
  onChangeHost: () => void;
  hostPermanentIds: readonly string[];
  onChooseHost: (permanentId: string) => void;
}

export function DecisionPrompts({
  decision,
  answerOnBoard,
  permanents,
  sourceCardId,
  candidates,
  allowsPick,
  picks,
  min,
  max,
  triggerDetails,
  opponentSecurityCount,
  onTogglePick,
  onRespond,
  onOpenDialog,
  sourceHost,
}: {
  /** The viewer's own decision, once the presentation has caught up with it. */
  decision: DecisionRequest | undefined;
  /** This decision is answered on the board rather than in the dialog. */
  answerOnBoard: boolean;
  /** Both battle areas, which is where the dialog reads its stack and DP badges. */
  permanents: readonly Permanent[];
  sourceCardId: string | undefined;
  candidates: readonly {
    instanceId: string;
    cardId?: string;
    artId?: string;
    zone?: CandidateZone;
    pendingEffect?: boolean;
    trashOriginCardId?: string;
  }[];
  allowsPick: (instanceId: string) => boolean;
  picks: string[];
  min: number;
  max: number;
  triggerDetails: readonly TriggerDetail[];
  /** Whether attacking the opponent is a Security Attack or a Direct Attack. */
  opponentSecurityCount: number;
  onTogglePick: (instanceId: string) => void;
  onRespond: (response: DecisionResponse) => void;
  onOpenDialog: () => void;
  /** A source pick that first asks which Digimon to look under. */
  sourceHost?: SourceHostStep;
}) {
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  const clause = sourceCardId
    ? playerFacingEffectClause({
        cardId: decision?.options?.effectTextCardId ?? sourceCardId,
        timing: decision?.options?.timing,
        description: decision?.options?.effectText,
        effectTextPart: decision?.options?.effectTextEmphasis
          ? (decision.options.effectText ?? decision.options.effectTextPart)
          : decision?.options?.effectTextPart,
        isInherited: decision?.options?.isInherited,
      })
    : undefined;
  const attack = attackTargetPrompt(decision, permanents);
  const attackClause = (() => {
    if (attack?.attackerCardId === undefined) return undefined;
    const card = getCardName(attack.attackerCardId);
    const only = attack.onlyTarget;
    if (only === undefined) return t("overlay.attackChooseTarget", { card });
    const target =
      only.kind === "player"
        ? t(opponentSecurityCount > 0 ? "overlay.attackTargetSecurity" : "overlay.attackTargetPlayer")
        : only.cardId === undefined
          ? undefined
          : getCardName(only.cardId);
    return target === undefined
      ? t("overlay.attackChooseTarget", { card })
      : t("overlay.attackOnlyTarget", { card, target });
  })();
  const attackConfirmLabel = attack === undefined ? undefined : t("overlay.declareAttack");
  const boardSelectionKind =
    decision?.kind === "selectCards" || decision?.kind === "chooseTargets" ? decision.kind : undefined;
  const assemblyCardId = decision?.kind === "selectCards" ? decision.options?.assemblyCardId : undefined;
  const assemblyRequirements = assemblyCardId ? assemblyRequirementFor(assemblyCardId) : undefined;
  const isAssemblyDecision = assemblyCardId !== undefined && (assemblyRequirements?.length ?? 0) > 0;
  const digiXrosCardId = decision?.kind === "selectCards" ? decision.options?.digiXrosCardId : undefined;
  const digiXrosRequirements = digiXrosCardId ? digiXrosRequirementFor(digiXrosCardId) : undefined;
  const isDigiXrosDecision = digiXrosCardId !== undefined && digiXrosRequirements !== undefined;
  const isMaterialDecision = isAssemblyDecision || isDigiXrosDecision;
  const selectedPlayCost = totalPlayCost({ picks, candidates });
  const permanentDetails = decisionPermanentDetails(permanents);
  const selectedDP = totalDP({ picks, dpOf: (id) => permanentDetails.get(id)?.currentDP });
  const maxPlayCost = decision?.options?.maxTotalPlayCost;
  const maxDP = decision?.options?.maxTotalDP;
  const budgetText = [
    maxPlayCost === undefined
      ? undefined
      : t("overlay.playCostBudget", { selected: selectedPlayCost, max: maxPlayCost }),
    maxDP === undefined
      ? undefined
      : t("overlay.dpBudget", { selected: selectedDP.toLocaleString(), max: maxDP.toLocaleString() }),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      {decision && !answerOnBoard && sourceHost?.picking ? (
        <BoardSourceHostPrompt
          sourceCardId={sourceCardId}
          clause={clause}
          clauseEmphasis={decision.options?.effectTextEmphasis}
          onCancel={
            boardSelectionKind &&
            (min === 0 || decision.options?.declinesCost === true || decision.options?.canCancelActivation === true)
              ? () => onRespond({ kind: boardSelectionKind, instanceIds: [] })
              : undefined
          }
        />
      ) : null}

      {decision && decision.kind !== "mulligan" && !answerOnBoard && !isMaterialDecision && !sourceHost?.picking
        ? (() => {
            const sourceCounts = decisionSourceCounts(permanents);
            return (
              <DecisionOverlay
                key={decision.decisionId}
                request={decision}
                sourceCardId={sourceCardId}
                confirmLabel={attackConfirmLabel}
                contextText={decision.options?.effectTextEmphasis ? undefined : attackClause}
                candidates={candidates
                  .filter((card) => sourceHost?.cardIds === undefined || sourceHost.cardIds.has(card.instanceId))
                  .map((card) => {
                    const details = permanentDetails.get(card.instanceId);
                    const host =
                      card.zone === "digivolutionCards" || card.zone === "opponentDigivolutionCards"
                        ? permanents.find((permanent) =>
                            permanent.stack.some((source) => source.instanceId === card.instanceId),
                          )
                        : undefined;
                    return {
                      instanceId: card.instanceId,
                      cardId: card.cardId,
                      artId: card.artId,
                      selectable: allowsPick(card.instanceId),
                      sourceCount: sourceCounts.get(card.instanceId),
                      hostCardId: host?.topCard.cardId,
                      hostPermanentId: host?.permanentId,
                      currentDP: details?.currentDP,
                      isSuspended: details?.isSuspended,
                      zone: card.zone,
                      pendingEffect: card.pendingEffect,
                      oncePerTurnUsed:
                        host?.stack.some(
                          (source) => source.instanceId === card.instanceId && source.oncePerTurnUsed,
                        ) === true,
                      trashOriginCardId: card.trashOriginCardId,
                    };
                  })}
                picks={picks}
                triggerDetails={triggerDetails}
                onTogglePick={onTogglePick}
                onRespond={onRespond}
                sourcePicker={sourceHost !== undefined}
                {...(sourceHost?.cardIds && sourceHost.hostPermanentIds.length > 1
                  ? { onChangeSourceHost: sourceHost.onChangeHost }
                  : {})}
              />
            );
          })()
        : null}

      {decision && answerOnBoard && boardSelectionKind && !isMaterialDecision ? (
        <BoardSelectionRail
          attackSelection={decision.options?.selectionContext === "attackTarget"}
          fieldSelection={candidates.some(
            (candidate) => candidate.zone === "battle" || candidate.zone === "opponentBattle",
          )}
          key={decision.decisionId}
          sourceCardId={sourceCardId}
          prompt={
            (decision.options?.promptKey === "digivolveHost" ? t("overlay.digivolveHostPrompt") : undefined) ??
            playerFacingPromptText(decision.promptText, decision.kind) ??
            (min === max
              ? t("overlay.selectCardsSubtitle", { count: max })
              : t("overlay.selectCardsRangeSubtitle", { range: `${min}–${max}` }))
          }
          clause={decision.options?.effectTextEmphasis ? (clause ?? attackClause) : (attackClause ?? clause)}
          clauseEmphasis={decision.options?.effectTextEmphasis}
          min={min}
          max={max}
          pickCount={picks.length}
          canConfirm={
            ((picks.length === 0 && min === 0) ||
              isAllowedTargetSelection({
                allowedTargetCombinations: decision.options?.allowedTargetCombinations,
                picks,
                complete: true,
              })) &&
            picks.length >= min &&
            picks.length <= max &&
            picks.every((id) => allowsPick(id)) &&
            (maxPlayCost === undefined || selectedPlayCost <= maxPlayCost) &&
            (maxDP === undefined || selectedDP <= maxDP)
          }
          budgetText={budgetText || undefined}
          confirmLabel={attackConfirmLabel}
          onConfirm={() => onRespond({ kind: boardSelectionKind, instanceIds: picks })}
          onNoSelection={() => onRespond({ kind: boardSelectionKind, instanceIds: [] })}
          onCancelActivation={
            decision.options?.canCancelActivation === true
              ? () => onRespond({ kind: boardSelectionKind, instanceIds: [] })
              : undefined
          }
          onOpenDialog={onOpenDialog}
        />
      ) : null}

      {decision?.kind === "selectCards" && assemblyCardId && assemblyRequirements && isAssemblyDecision ? (
        <AssemblyMaterialOverlay
          playingCardId={assemblyCardId}
          requirements={assemblyRequirements}
          playCostReductionBlocked={decision.options?.playCostReductionBlocked}
          candidates={candidates.flatMap((candidate) =>
            candidate.cardId
              ? [{ instanceId: candidate.instanceId, cardId: candidate.cardId, artId: candidate.artId }]
              : [],
          )}
          onConfirm={(instanceIds) => onRespond({ kind: "selectCards", instanceIds })}
          onSkip={() => onRespond({ kind: "selectCards", instanceIds: [] })}
        />
      ) : null}

      {decision?.kind === "selectCards" && digiXrosCardId && digiXrosRequirements ? (
        <DigiXrosMaterialOverlay
          key={decision.decisionId}
          playingCardId={digiXrosCardId}
          requirements={digiXrosRequirements}
          materialLimits={decision.options?.digiXrosMaterialLimits}
          playCostReductionBlocked={decision.options?.playCostReductionBlocked}
          candidates={candidates.flatMap<DigiXrosCandidate>((candidate) => {
            if (!candidate.cardId || (candidate.zone !== "hand" && candidate.zone !== "battle")) return [];
            const permanent = permanents.find((entry) => entry.topCard?.instanceId === candidate.instanceId);
            return [
              {
                instanceId: candidate.instanceId,
                cardId: candidate.cardId,
                artId: candidate.artId,
                zone: candidate.zone,
                ...(permanent
                  ? {
                      digiXrosNames: [...permanent.digiXrosNames],
                      canSubstitute: permanent.keywords.includes("DigiXrosSubstitute"),
                    }
                  : {}),
              },
            ];
          })}
          lockedCandidates={candidates.flatMap<DigiXrosCandidate>((candidate) => {
            if (!candidate.cardId) return [];
            if (candidate.zone === "trash")
              return [
                { instanceId: candidate.instanceId, cardId: candidate.cardId, artId: candidate.artId, zone: "trash" },
              ];
            if (candidate.zone === "digivolutionCards")
              return [
                {
                  instanceId: candidate.instanceId,
                  cardId: candidate.cardId,
                  artId: candidate.artId,
                  zone: "underTamer",
                },
              ];
            return [];
          })}
          eligibleExpanders={[]}
          intrinsicTrashMax={candidates.filter((candidate) => candidate.zone === "trash").length}
          intrinsicUnderTamerMax={candidates.filter((candidate) => candidate.zone === "digivolutionCards").length}
          onConfirm={(instanceIds) => onRespond({ kind: "selectCards", instanceIds })}
          onSkip={() => onRespond({ kind: "selectCards", instanceIds: [] })}
        />
      ) : null}

      {decision && answerOnBoard && decision.kind === "optional" ? (
        <BoardOptionalPrompt
          key={decision.decisionId}
          sourceCardId={sourceCardId}
          contextText={
            decision.options?.promptKey === "attackAlreadyResolving"
              ? t("overlay.attackAlreadyResolving")
              : clause
                ? undefined
                : playerFacingPromptText(decision.promptText, decision.kind)
          }
          sourcePermanentId={decision.sourcePermanentId}
          clause={clause}
          clauseEmphasis={decision.options?.effectTextEmphasis}
          onUse={() => onRespond({ kind: "optional", accept: true })}
          onDecline={() => onRespond({ kind: "optional", accept: false })}
          onOpenDialog={onOpenDialog}
        />
      ) : null}
    </>
  );
}
