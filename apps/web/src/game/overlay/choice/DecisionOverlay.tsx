import "@/game/overlay/choice/sourceCardPicker.css";
import { getCardTextField } from "@/i18n/getCardTextField";
import { useTranslatedCardText } from "@/i18n/useTranslatedCardText";
import { EffectText } from "@/game/EffectText";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { isAllowedTargetSelection } from "@/game/screen/model/isAllowedTargetSelection";
import { EffectStepText } from "@/game/overlay/choice/EffectStepText";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { printedModalPreamble, type DecisionRequest, type DecisionResponse } from "@aegis/shared";
import { CardMini } from "../../../design/cards";
import { Icons } from "../../../design/icons";
import { Button } from "../../../design/primitives";
import { useMediaQuery, WIDE_DIALOG_QUERY } from "../../../design/useMediaQuery";
import { useTranslation } from "../../../i18n";
import { useCardOpener } from "../../cardLinks";
import { useDraggableWindow } from "../../chat/useDraggableWindow";
import { useEffectPromptPosition, type EffectPromptPosition } from "@/game/effectPromptPosition";
import { effectDecisionSurface, isEffectActivationDecision, decisionSelectionMin } from "../../decisionPresentation";
import { pendingFateBadge } from "../../pendingFate";
import { playerFacingEffectClause, playerFacingPromptText } from "../effectText";
import type { TriggerDetail } from "../types";
import { DecisionBoardReturn } from "./DecisionBoardReturn";
import { abstractTargetLabel } from "./decisionCandidateLabels";
import { DecisionCandidateGrid } from "./DecisionCandidateGrid";
import { DecisionChoiceCards } from "./DecisionChoiceCards";
import { DecisionChooseFooter } from "./DecisionChooseFooter";
import { DecisionClauseChoice } from "./DecisionClauseChoice";
import { DecisionDigivolveCostChoice } from "./DecisionDigivolveCostChoice";
import { DecisionEffectChoice } from "./DecisionEffectChoice";
import { trapDialogFocus } from "./decisionFocusTrap";
import { DecisionOptionalFooter } from "./DecisionOptionalFooter";
import { DecisionOrderCardsFooter } from "./DecisionOrderCardsFooter";
import { DecisionOrderCardsPanel } from "./DecisionOrderCardsPanel";
import { reorderDecisionItems } from "./useDecisionReorder";
import { totalPlayCost } from "./decisionPlayCost";
import { totalDP } from "./decisionDpBudget";
import { DecisionSelectFooter } from "./DecisionSelectFooter";
import { DecisionTriggerChooser, type WaitingTrigger } from "./DecisionTriggerChooser";
import type { DecisionCandidate } from "./decisionTypes";
import "../effectPromptFamily.css";
import { usePromptHandSpace } from "./usePromptHandSpace";
import { useSourceClearPlacement } from "./useSourceClearPlacement";
import { PromptMoveHandle } from "./PromptMoveHandle";
import { useNoticeBandPassThrough } from "./useNoticeBandPassThrough";

/** The art of the card asking the question, big enough to recognise beside its clause. */
const DECISION_SOURCE_ART_WIDTH = 72;

type DialogWidthParams = {
  docksOnRail: boolean;
  isResolutionPlan: boolean;
  wideDialog: boolean;
  itemCount: number;
};

/** A choice or yes/no prompt docks on the left rail at its own width (redesignArena.css). */
function dialogWidth({ docksOnRail, isResolutionPlan, wideDialog, itemCount }: DialogWidthParams): number | undefined {
  if (docksOnRail) return undefined;
  if (isResolutionPlan) return 760;
  if (wideDialog && itemCount > 3) return 1000;
  return 560;
}

type DecisionSurfaceParams = {
  request: DecisionRequest;
  position: EffectPromptPosition;
  isCardChoice: boolean;
  isOrdering: boolean;
  isSecurityChoice: boolean;
};

function getDecisionSurface({
  request,
  position,
  isCardChoice,
  isOrdering,
  isSecurityChoice,
}: DecisionSurfaceParams): EffectPromptPosition {
  if (isCardChoice || isOrdering) {
    return "center";
  }
  if (isSecurityChoice) {
    return position;
  }
  return effectDecisionSurface(request, position);
}

/** Sibling of the scrolling sheet, so its entrance transform cannot crop the arena shade. */
function DecisionBackdrop({ side = false }: { side?: boolean }) {
  const noticeBand = useNoticeBandPassThrough();
  return (
    <div
      className={`decision-overlay-backdrop${side ? " decision-overlay-backdrop--side" : ""}`}
      style={noticeBand}
      aria-hidden="true"
    />
  );
}

export function DecisionOverlay({
  request,
  sourceCardId,
  candidates,
  picks,
  triggerDetails = [],
  onTogglePick,
  onRespond,
  onChangeSourceHost,
  sourcePicker = onChangeSourceHost !== undefined,
  confirmLabel,
  contextText,
}: {
  request: DecisionRequest;
  confirmLabel?: string;
  contextText?: string;
  sourceCardId?: string;
  candidates: DecisionCandidate[];
  picks: string[];
  /** Aligned to `request.options.triggerKeys`; empty means the chooser shows names only. */
  triggerDetails?: readonly TriggerDetail[];
  onTogglePick: (instanceId: string) => void;
  onRespond: (response: DecisionResponse) => void;
  /**
   * Set when the pick is narrowed to one Digimon's digivolution cards: the dialog then shows
   * only those cards, without the effect text, and offers to go back to choosing a Digimon.
   */
  onChangeSourceHost?: () => void;
  sourcePicker?: boolean;
}) {
  const getCardName = useTranslatedCardName();
  const { t, locale } = useTranslation();
  const translateCardText = useTranslatedCardText();
  const effectPromptPosition = useEffectPromptPosition();
  const openCard = useCardOpener();
  const wideDialog = useMediaQuery(WIDE_DIALOG_QUERY);
  const selectedSourceHostCardId = sourcePicker
    ? candidates.find((candidate) => candidate.hostCardId)?.hostCardId
    : undefined;
  const headerCardId = selectedSourceHostCardId ?? sourceCardId;
  const min = decisionSelectionMin(request);
  const max = request.options?.max ?? 1;
  const choices = request.options?.choices ?? [];
  const choiceEffects = request.options?.choiceEffects;
  const declineIndex = request.options?.declineIndex;
  const choiceClauses = request.options?.choiceClauses;
  const isOptional = request.kind === "optional";
  const isChoose = request.kind === "chooseOption";
  const isCardChoice =
    isChoose &&
    choiceEffects === undefined &&
    candidates.length > 0 &&
    request.options?.digivolveCostChoice === undefined;
  const choosesPrintedBullet =
    isChoose &&
    choiceEffects === undefined &&
    choiceClauses !== undefined &&
    choiceClauses.length === choices.length &&
    choiceClauses.some(Boolean);
  const isSelect = request.kind === "chooseTargets" || request.kind === "selectCards";
  const isSecurityChoice =
    isSelect &&
    candidates.length === 1 &&
    abstractTargetLabel({ instanceId: candidates[0]!.instanceId, t }) !== undefined;
  const activationCandidate = request.options?.candidateInstanceIds?.[0];
  const isPartitionActivation =
    request.kind === "selectCards" &&
    request.options?.selectionContext === "partitionActivation" &&
    activationCandidate !== undefined;
  const isMaterialSaveActivation =
    request.kind === "selectCards" &&
    request.options?.selectionContext === "materialSaveActivation" &&
    activationCandidate !== undefined;
  const isKeywordActivation = isPartitionActivation || isMaterialSaveActivation;
  const isOrderCards = request.kind === "orderCards";
  const isOrderTriggers = request.kind === "orderTriggers";
  const isResolutionPlan = isOrderTriggers && request.options?.acceptsResolutionPlan === true;
  const isOrdering = isOrderCards || isOrderTriggers;
  const surface = getDecisionSurface({
    request,
    position: effectPromptPosition,
    isCardChoice,
    isOrdering,
    isSecurityChoice,
  });
  const docksOnRail = surface === "left";
  const draggableActivation = isEffectActivationDecision(request) && !isCardChoice;
  const triggerKeys = request.options?.triggerKeys ?? [];
  const triggerCardIds = request.options?.triggerCardIds ?? [];
  const maxTotalPlayCost = request.options?.maxTotalPlayCost;
  const selectedPlayCost = totalPlayCost({ picks, candidates });
  const withinPlayCostBudget = maxTotalPlayCost === undefined || selectedPlayCost <= maxTotalPlayCost;
  const maxTotalDP = request.options?.maxTotalDP;
  const selectedDP = totalDP({
    picks,
    dpOf: (id) => candidates.find((candidate) => candidate.instanceId === id)?.currentDP,
  });
  const withinDPBudget = maxTotalDP === undefined || selectedDP <= maxTotalDP;
  const hasCandidates = (request.options?.candidateInstanceIds?.length ?? 0) > 0;
  const canConfirm =
    (picks.length > 0 || !hasCandidates) &&
    picks.length >= min &&
    picks.length <= max &&
    withinPlayCostBudget &&
    withinDPBudget &&
    isAllowedTargetSelection({
      allowedTargetCombinations: request.options?.allowedTargetCombinations,
      picks,
      complete: true,
    });
  // The fate every picked target meets, or nothing when the engine did not
  // project one for the action that raised this prompt.
  const fateBadge = request.options?.targetFate ? pendingFateBadge(request.options.targetFate) : undefined;

  const [isViewingBoard, setIsViewingBoard] = useState(false);
  const [cardOrder, setCardOrder] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnControlRef = useRef<HTMLDivElement>(null);
  const drag = useDraggableWindow(panelRef, { viewportGutter: 16, resetKey: `${request.decisionId}:${surface}` });
  usePromptHandSpace(panelRef, !isViewingBoard);
  const sourceClear = useSourceClearPlacement(
    request.sourcePermanentId,
    draggableActivation && !isViewingBoard && drag.position === undefined,
  );
  useEffect(() => {
    setIsViewingBoard(false);
  }, [request.decisionId]);
  useEffect(() => {
    setCardOrder(candidates.map((candidate) => candidate.instanceId));
  }, [request.decisionId]);
  useEffect(() => {
    if (isViewingBoard) returnControlRef.current?.querySelector("button")?.focus();
    else panelRef.current?.focus();
  }, [isViewingBoard]);

  const moveOrderedCard = (index: number, delta: -1 | 1) => {
    setCardOrder((current) => {
      const destination = index + delta;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination]!, next[index]!];
      return next;
    });
  };

  const confirmSelect = () => {
    if (request.kind === "selectCards") onRespond({ kind: "selectCards", instanceIds: picks });
    else onRespond({ kind: "chooseTargets", instanceIds: picks });
  };

  const sourceClause =
    contextText ??
    (sourceCardId
      ? playerFacingEffectClause({
          cardId: request.options?.effectTextCardId ?? sourceCardId,
          timing: request.options?.timing,
          description: request.options?.effectText,
          effectTextPart: request.options?.effectTextEmphasis
            ? (request.options.effectText ?? request.options.effectTextPart)
            : request.options?.effectTextPart,
          isInherited: request.options?.isInherited,
        })
      : undefined);
  // Each bullet is spelled out on its own option, so the header keeps only the lead-in.
  const sourceEffectText =
    choosesPrintedBullet && sourceClause !== undefined ? printedModalPreamble(sourceClause) : sourceClause;
  /* The dialog is named by a plain string rather than by its visible title: that title
     now carries the source card as a link, and an aria-labelledby would read the link's
     own label ("Open …") in place of the card's name. */
  const dialogLabel = sourceCardId ? t("overlay.cardEffect", { name: getCardName(sourceCardId) }) : t("overlay.effect");

  // A choice with a decline entry is an optional effect asking which way to use it.
  const genericPrompt = t(
    request.options?.selectionContext === "attackTarget"
      ? "overlay.declareAttack"
      : isOptional || (isChoose && declineIndex !== undefined)
        ? "overlay.useEffectPrompt"
        : isChoose
          ? "overlay.chooseEffectPrompt"
          : isOrderCards
            ? "overlay.chooseCardOrderPrompt"
            : "overlay.resolveEffect",
  );
  // The eyebrow above already names the source card; repeating it as the title says nothing twice.
  const specificPrompt =
    request.options?.promptKey === "attackAlreadyResolving"
      ? t("overlay.attackAlreadyResolving")
      : playerFacingPromptText(
          request.promptText,
          request.kind,
          request.options?.effectTextPart ? sourceEffectText : undefined,
        );
  const promptText =
    isOptional || isMaterialSaveActivation || (isChoose && declineIndex !== undefined)
      ? t("overlay.useEffectPrompt")
      : request.options?.selectionContext === "attackTarget"
        ? t("overlay.declareAttack")
        : isPartitionActivation
          ? t("overlay.activatePartitionPrompt")
          : request.options?.promptKey === "activateBlitz"
            ? t("overlay.activateBlitzPrompt")
            : request.options?.promptKey === "digivolveHost"
              ? t("overlay.digivolveHostPrompt")
              : !specificPrompt || (sourceCardId && specificPrompt === getCardName(sourceCardId))
                ? genericPrompt
                : specificPrompt;

  // Older decisions may carry their only effect description in the question.
  // Keep that context in the body while all activations share the same heading.
  const displayedEffectText = sourceEffectText ?? (isOptional ? specificPrompt : undefined);
  const emphasis = request.options?.effectTextEmphasis;
  const renderedEffectText = displayedEffectText ? (
    <EffectStepText
      timing={request.options?.timing}
      text={displayedEffectText}
      emphasis={emphasis}
      field={getCardTextField({
        cardId: request.options?.effectTextCardId ?? sourceCardId,
        timing: request.options?.timing,
        isInherited: request.options?.isInherited,
        text: displayedEffectText,
      })}
      cardId={request.options?.effectTextCardId ?? sourceCardId}
    />
  ) : undefined;

  let headerTitle = translateCardText({ text: promptText, cardId: request.options?.effectTextCardId ?? sourceCardId });
  if (isResolutionPlan) {
    headerTitle = t("overlay.orderPendingEffects");
  }
  if (selectedSourceHostCardId) {
    headerTitle = getCardName(selectedSourceHostCardId);
  }

  const boardReturn = isViewingBoard ? (
    <DecisionBoardReturn returnControlRef={returnControlRef} onReturn={() => setIsViewingBoard(false)} />
  ) : null;

  const digivolveCostChoice = isChoose ? request.options?.digivolveCostChoice : undefined;
  if (digivolveCostChoice !== undefined && digivolveCostChoice.costs.length === choices.length) {
    return (
      <>
        {boardReturn}
        <div hidden={isViewingBoard}>
          <DecisionBackdrop side={effectPromptPosition === "left"} />
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={t("game.digivolve")}
            data-prompt-surface={effectPromptPosition}
            className={`game-modal__panel game-modal__panel--bare decision-overlay effect-prompt-family${effectPromptPosition === "left" ? " decision-overlay--side" : ""}`}
            onKeyDown={(event) => trapDialogFocus({ event, panelRef })}
          >
            <DecisionDigivolveCostChoice
              choice={digivolveCostChoice}
              onChoose={(optionIndex) => onRespond({ kind: "chooseOption", optionIndex })}
              onViewBoard={() => setIsViewingBoard(true)}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {boardReturn}
      <div hidden={isViewingBoard}>
        <DecisionBackdrop side={docksOnRail} />
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={dialogLabel}
          data-prompt-surface={surface}
          data-effect-activation={draggableActivation || undefined}
          data-prompt-dragged={(draggableActivation && drag.position !== undefined) || undefined}
          data-source-clear={sourceClear?.["data-source-clear"]}
          className={`game-modal__panel game-modal__panel--bare decision-overlay effect-prompt-family${wideDialog ? " decision-overlay--wide" : ""}${isCardChoice ? " decision-overlay--card-choice" : ""}${isOrdering ? " decision-overlay--ordering" : ""}${isSecurityChoice ? " decision-overlay--security-choice" : ""}${isSelect ? " decision-overlay--selection" : ""}${sourcePicker ? " decision-overlay--source-picker" : ""}${isOrderTriggers ? " decision-overlay--trigger-chooser" : ""}${isResolutionPlan ? " decision-overlay--resolution-plan" : ""}${docksOnRail ? " decision-overlay--side" : ""}`}
          onKeyDown={(event) => trapDialogFocus({ event, panelRef })}
          /* Geometry, surface and entrance all live in game.css: inline values could not be
         overridden by the phone bottom-sheet rules, and an inline `animation` shorthand
         hid both the shared `--t-dialog-in` timing and the reduced-motion override. */
          style={{
            width: dialogWidth({
              docksOnRail,
              isResolutionPlan,
              wideDialog,
              itemCount: Math.max(candidates.length, triggerKeys.length),
            }),
            ...(draggableActivation && drag.position
              ? ({
                  "--effect-prompt-drag-left": `${drag.position.left}px`,
                  "--effect-prompt-drag-top": `${drag.position.top}px`,
                } as CSSProperties)
              : {}),
            ...sourceClear?.style,
          }}
        >
          {/* Artwork and the question share the same compact header as combat prompts. */}
          <div className="decision-overlay__header">
            {headerCardId ? (
              /* The art is now the only mention of the card, so it carries the link that the
             spelled-out name used to: same route to the full card, one less line to read. */
              openCard ? (
                <button
                  type="button"
                  className="decision-overlay__source-art"
                  aria-label={t("feed.openCard", { card: getCardName(headerCardId) })}
                  onClick={() => openCard(headerCardId)}
                >
                  <span className="mobile-prompt-art">
                    <CardMini cardId={headerCardId} width={DECISION_SOURCE_ART_WIDTH} zoomOnHover={false} />
                  </span>
                </button>
              ) : (
                <span className="decision-overlay__source-art" aria-hidden="true">
                  <span className="mobile-prompt-art">
                    <CardMini cardId={headerCardId} width={DECISION_SOURCE_ART_WIDTH} zoomOnHover={false} />
                  </span>
                </span>
              )
            ) : null}
            <div className="decision-overlay__question">
              <div className="decision-overlay__heading">
                <h2 className="decision-overlay__title">{headerTitle}</h2>
              </div>
              {selectedSourceHostCardId ? (
                <p className="decision-overlay__source-picker-label">{t("overlay.candidateZone.digivolutionCards")}</p>
              ) : null}
              <div className="decision-overlay__clauses">
                {!isOrderTriggers && displayedEffectText && !sourcePicker ? (
                  <p className="decision-overlay__effect-text">
                    {locale === "zh-CN" ? (
                      <EffectText
                        text={displayedEffectText}
                        field={getCardTextField({
                          cardId: request.options?.effectTextCardId ?? sourceCardId,
                          timing: request.options?.timing,
                          isInherited: request.options?.isInherited,
                          text: displayedEffectText,
                        })}
                        surface="decision"
                        timing={request.options?.timing}
                        allowContext
                        cardId={request.options?.effectTextCardId ?? sourceCardId}
                      />
                    ) : (
                      renderedEffectText
                    )}
                  </p>
                ) : null}
                {isOptional && request.options?.promptKey === "attackAlreadyResolving" && sourceEffectText ? (
                  <p className="decision-overlay__effect-text">{specificPrompt}</p>
                ) : null}
              </div>
              {onChangeSourceHost ? (
                <Button size="sm" variant="ghost" icon={Icons.ArrowLeft} onClick={onChangeSourceHost}>
                  {t("overlay.chooseAnotherSourceHost")}
                </Button>
              ) : null}
            </div>
            {draggableActivation ? <PromptMoveHandle drag={drag} className="decision-overlay__move-handle" /> : null}
          </div>

          {isKeywordActivation ? (
            <DecisionChoiceCards candidates={candidates} wideDialog={wideDialog} />
          ) : isSelect ? (
            <DecisionCandidateGrid
              candidates={candidates}
              picks={picks}
              min={min}
              max={max}
              maxTotalPlayCost={maxTotalPlayCost}
              selectedPlayCost={selectedPlayCost}
              withinPlayCostBudget={withinPlayCostBudget}
              maxTotalDP={maxTotalDP}
              selectedDP={selectedDP}
              sourcePicker={sourcePicker}
              fateBadge={fateBadge}
              onTogglePick={onTogglePick}
            />
          ) : null}

          {isOrderCards ? (
            <DecisionOrderCardsPanel
              candidates={candidates}
              cardOrder={cardOrder}
              wideDialog={wideDialog}
              orderDestination={request.options?.orderDestination}
              onMove={moveOrderedCard}
              onReorder={(from, to) => setCardOrder((current) => reorderDecisionItems(current, from, to))}
            />
          ) : null}

          {/* A choice about revealed cards shows them; the player must not decide blind. */}
          {isChoose && choiceEffects === undefined && candidates.length > 0 ? (
            <DecisionChoiceCards candidates={candidates} wideDialog={wideDialog} largeCards={isCardChoice} />
          ) : null}

          {isChoose && choiceEffects !== undefined ? (
            <DecisionEffectChoice
              choices={choices}
              choiceEffects={choiceEffects}
              wideDialog={wideDialog}
              onRespond={onRespond}
              onOpenBoard={() => setIsViewingBoard(true)}
            />
          ) : choosesPrintedBullet ? (
            <DecisionClauseChoice
              choices={choices}
              choiceClauses={choiceClauses}
              cardId={request.options?.effectTextCardId ?? sourceCardId}
              declineIndex={declineIndex}
              activation={request.options?.activation}
              onRespond={onRespond}
              onOpenBoard={() => setIsViewingBoard(true)}
            />
          ) : isChoose ? (
            <DecisionChooseFooter
              choices={choices}
              declineIndex={declineIndex}
              topBottomZone={request.options?.topBottomZone}
              onRespond={onRespond}
              onOpenBoard={() => setIsViewingBoard(true)}
            />
          ) : null}

          {isOptional ? (
            <DecisionOptionalFooter onRespond={onRespond} onOpenBoard={() => setIsViewingBoard(true)} />
          ) : null}

          {isKeywordActivation ? (
            <DecisionOptionalFooter
              onRespond={(response) => {
                if (response.kind !== "optional") return;
                onRespond({ kind: "selectCards", instanceIds: response.accept ? [activationCandidate] : [] });
              }}
              onOpenBoard={() => setIsViewingBoard(true)}
            />
          ) : isSelect ? (
            <DecisionSelectFooter
              canConfirm={canConfirm}
              confirmLabel={
                confirmLabel ??
                (request.options?.selectionContext === "attackTarget" ? t("overlay.declareAttack") : undefined)
              }
              onConfirm={confirmSelect}
              min={min}
              onNone={() =>
                onRespond({ kind: request.kind === "selectCards" ? "selectCards" : "chooseTargets", instanceIds: [] })
              }
              cancelLabel={sourcePicker ? t("common.cancel") : undefined}
              onCancelActivation={
                (request.kind === "chooseTargets" && request.options?.canCancelActivation === true) ||
                (sourcePicker && (request.options?.declinesCost === true || min === 0))
                  ? () =>
                      onRespond({
                        kind: request.kind === "selectCards" ? "selectCards" : "chooseTargets",
                        instanceIds: [],
                      })
                  : undefined
              }
              onDeclineCost={
                request.options?.declinesCost === true
                  ? () =>
                      onRespond({
                        kind: request.kind === "selectCards" ? "selectCards" : "chooseTargets",
                        instanceIds: [],
                      })
                  : undefined
              }
              onOpenBoard={() => setIsViewingBoard(true)}
            />
          ) : null}

          {isOrderTriggers ? (
            <DecisionTriggerChooser
              key={request.decisionId}
              triggerKeys={triggerKeys}
              triggerCardIds={triggerCardIds}
              triggerDetails={triggerDetails}
              wideDialog={wideDialog}
              timing={request.options?.timing}
              triggerTimings={request.options?.triggerTimings}
              triggerDescriptions={request.options?.triggerDescriptions}
              triggerReasons={request.options?.triggerReasons}
              triggerIsInherited={request.options?.triggerIsInherited}
              triggerIsOptional={request.options?.triggerIsOptional}
              waitingTriggers={waitingTriggersOf(request)}
              acceptsResolutionPlan={isResolutionPlan}
              acceptsIndexedResolutionPlan={request.options?.acceptsIndexedResolutionPlan === true}
              onRespond={onRespond}
              onOpenBoard={() => setIsViewingBoard(true)}
            />
          ) : null}
          {isOrderCards ? (
            <DecisionOrderCardsFooter
              onConfirm={() => onRespond({ kind: "orderCards", order: cardOrder })}
              onOpenBoard={() => setIsViewingBoard(true)}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

function waitingTriggersOf(request: DecisionRequest): WaitingTrigger[] {
  const cardIds = request.options?.waitingTriggerCardIds ?? [];
  return cardIds.map((cardId, index) => ({
    cardId,
    description: request.options?.waitingTriggerDescriptions?.[index],
    isInherited: request.options?.waitingTriggerIsInherited?.[index] === true,
  }));
}
