import { useEffect, useId, useState } from "react";
import type { DigiXrosRequirement } from "@aegis/shared";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { printedCardName } from "../printedCardName";
import { Scrim } from "../Scrim";
import type { DigiXrosCandidate, DigiXrosEligibleExpander } from "../types";
import { DigiXrosCandidateGrid } from "./DigiXrosCandidateGrid";
import { DigiXrosExpanderPrompt } from "./DigiXrosExpanderPrompt";
import { DigiXrosLockedZone } from "./DigiXrosLockedZone";
import { digiXrosMaterialPool } from "./digiXrosMaterialPool";
import { pruneDigiXrosMaterialLimits, pruneDigiXrosPicksForZoneLimits, toggleDigiXrosPick } from "./digiXrosPicks";
import { digiXrosSlotLabel } from "./digiXrosSlotLabel";
import { CardArt } from "../CardArt";
import { useEffectPromptFocus } from "./useEffectPromptFocus";
import { useBoardPreview } from "./useBoardPreview";
import { DecisionViewBoardButton } from "./DecisionViewBoardButton";
import "../effectPromptFamily.css";

/**
 * Overlay shown when the player initiates play of a card with a DigiXros requirement.
 * The player picks material instance ids from unlocked source zones, then confirms.
 * Skipping sends an empty material list (plain play at full cost — server validates).
 * The server is the sole authority on legality; this is best-effort client-side filtering.
 */
const NO_MATERIAL_LIMITS: { candidateInstanceIds: string[]; max: number }[] = [];

export function DigiXrosMaterialOverlay({
  playingCardId,
  playCostReductionBlocked = false,
  requirements,
  materialLimits = NO_MATERIAL_LIMITS,
  candidates,
  lockedCandidates,
  eligibleExpanders,
  intrinsicTrashMax = 0,
  intrinsicUnderTamerMax = 0,
  onConfirm,
  onSkip,
  onCancel,
}: {
  /** The card about to be played. */
  playingCardId: string;
  playCostReductionBlocked?: boolean;
  /** DigiXros requirements for the card (at least one entry). */
  requirements: DigiXrosRequirement[];
  /** Per-cohort limits authorized by a resolving effect. */
  materialLimits?: { candidateInstanceIds: string[]; max: number }[];
  /** Eligible material candidates (hand + battle area top cards). */
  candidates: DigiXrosCandidate[];
  /** Material candidates in zones locked behind selected expander Tamers. */
  lockedCandidates: DigiXrosCandidate[];
  /** Unsuspended expander Tamers that can be suspended for this DigiXros play. */
  eligibleExpanders: DigiXrosEligibleExpander[];
  /** Trash capacity granted by the played card itself, without suspending a Tamer. */
  intrinsicTrashMax?: number;
  /** Under-Tamer capacity already authorized by the resolving effect. */
  intrinsicUnderTamerMax?: number;
  /** Confirm with the chosen materials and expander Tamers to suspend. */
  onConfirm: (materialInstanceIds: string[], expanderPermanentIds: string[]) => void;
  /** Play the card normally without DigiXros (full cost, no materials). */
  onSkip: () => void;
  /** Cancel: go back without playing. */
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const { isViewingBoard, openBoard, boardReturn } = useBoardPreview();
  const [picks, setPicks] = useState<string[]>([]);
  const [chosenExpanderPermanentIds, setChosenExpanderPermanentIds] = useState<string[]>([]);
  const [answeredExpanderPermanentIds, setAnsweredExpanderPermanentIds] = useState<string[]>([]);
  const pendingExpander = eligibleExpanders.find(
    (expander) => !answeredExpanderPermanentIds.includes(expander.permanentId),
  );
  const focusProps = useEffectPromptFocus(isViewingBoard || pendingExpander !== undefined);

  const req = requirements[0]!;
  const reductionLabel = playCostReductionBlocked
    ? t("overlay.xrosReductionPerPlaced", { count: 0 })
    : req.count === "∞"
      ? req.costReduction !== undefined
        ? t("overlay.xrosReductionPerCard", { count: req.costReduction })
        : t("overlay.xrosReductionVariable")
      : t("overlay.xrosReductionPerPlaced", { count: req.count });

  const slotLabels = req.materials.map((material) => digiXrosSlotLabel({ material, t }));
  const {
    trashMax,
    underTamerMax,
    trashCandidates,
    underTamerCandidates,
    candidateById,
    eligibleCandidateIds,
    pickedTrash,
    pickedUnderTamer,
  } = digiXrosMaterialPool({
    requirement: req,
    candidates,
    lockedCandidates,
    eligibleExpanders,
    chosenExpanderPermanentIds,
    intrinsicTrashMax,
    intrinsicUnderTamerMax,
    picks,
    materialLimits,
  });

  useEffect(() => {
    setPicks((prev) =>
      pruneDigiXrosMaterialLimits(
        pruneDigiXrosPicksForZoneLimits({ picks: prev, lockedCandidates, trashMax, underTamerMax }),
        materialLimits,
      ),
    );
  }, [lockedCandidates, trashMax, underTamerMax, materialLimits]);

  const toggle = (candidate: DigiXrosCandidate) => {
    setPicks((prev) =>
      pruneDigiXrosMaterialLimits(
        toggleDigiXrosPick({ picks: prev, candidate, candidateById, trashMax, underTamerMax }),
        materialLimits,
      ),
    );
  };

  const gridProps = {
    eligibleCandidateIds,
    picks,
    pickedTrash,
    pickedUnderTamer,
    trashMax,
    underTamerMax,
    onToggle: toggle,
    t,
  };

  if (isViewingBoard) return boardReturn;
  if (pendingExpander !== undefined) {
    return (
      <DigiXrosExpanderPrompt
        key={pendingExpander.permanentId}
        expander={pendingExpander}
        copyIndex={
          eligibleExpanders
            .filter((expander) => expander.cardId === pendingExpander.cardId)
            .findIndex((expander) => expander.permanentId === pendingExpander.permanentId) + 1
        }
        copyCount={eligibleExpanders.filter((expander) => expander.cardId === pendingExpander.cardId).length}
        onAnswer={(accept) => {
          if (accept) setChosenExpanderPermanentIds((prev) => [...prev, pendingExpander.permanentId]);
          setAnsweredExpanderPermanentIds((prev) => [...prev, pendingExpander.permanentId]);
        }}
      />
    );
  }
  return (
    <Scrim className="game-modal effect-prompt-layer">
      <div
        {...focusProps}
        className="game-modal__panel effect-prompt-family material-prompt"
        data-prompt-surface="center"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 640,
          width: "100%",
          background: "var(--ds-sheet)",
          borderRadius: 18,
          border: "1px solid var(--ds-line)",
          boxShadow: "var(--ds-shadow-raise)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div className="material-prompt__header">
          <span className="mobile-prompt-art">
            <CardArt cardId={playingCardId} width={64} />
          </span>
          <div>
            <div
              id={titleId}
              style={{ fontFamily: "var(--ds-font-display)", fontWeight: 800, fontSize: 18, color: "var(--ds-text)" }}
            >
              {t("overlay.xrosTitle", { name: printedCardName(playingCardId) })}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ds-text-3)", marginTop: 2 }}>
              {t("overlay.xrosDetail", { reduction: reductionLabel })}
              {slotLabels.length > 0 ? t("overlay.xrosAccepted", { slots: slotLabels.join(" × ") }) : null}
            </div>
          </div>
        </div>

        <div className="material-prompt__body">
          {chosenExpanderPermanentIds.length > 0 ? (
            <p role="status">
              {t("overlay.xrosTamersWillSuspend", {
                names: eligibleExpanders
                  .filter((expander) => chosenExpanderPermanentIds.includes(expander.permanentId))
                  .map((expander) => printedCardName(expander.cardId))
                  .join(", "),
              })}
            </p>
          ) : null}

          <DigiXrosCandidateGrid items={candidates} emptyText={t("overlay.xrosNoMaterials")} {...gridProps} />
          <DigiXrosLockedZone
            label={t("overlay.xrosZoneTrash")}
            items={trashCandidates}
            max={trashMax}
            hasEligibleExpanders={false}
            {...gridProps}
          />
          <DigiXrosLockedZone
            label={t("overlay.xrosZoneUnderTamers")}
            items={underTamerCandidates}
            max={underTamerMax}
            hasEligibleExpanders={false}
            {...gridProps}
          />

          <div style={{ fontSize: 12, color: "var(--ds-text-3)" }}>
            {picks.length === 0 ? t("overlay.xrosNoneSelected") : t("overlay.xrosSelected", { count: picks.length })}
          </div>
        </div>
        <div className="material-prompt__footer">
          <div className="game-actions-row">
            <Button full variant="secondary" onClick={onSkip}>
              {t("overlay.xrosPlayWithout")}
            </Button>
            {onCancel ? (
              <Button full variant="ghost" data-arena-cancel onClick={onCancel}>
                {t("common.cancel")}
              </Button>
            ) : null}
            <Button
              full
              icon={Icons.Sparkles}
              disabled={picks.length === 0}
              onClick={() => onConfirm(picks, chosenExpanderPermanentIds)}
            >
              {picks.length === 1 ? t("overlay.xrosConfirmOne") : t("overlay.xrosConfirm", { count: picks.length })}
            </Button>
          </div>
          {eligibleExpanders.length > 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                setChosenExpanderPermanentIds([]);
                setAnsweredExpanderPermanentIds([]);
              }}
            >
              {t("overlay.xrosChangeTamerEffects")}
            </Button>
          ) : null}
          <div className="effect-prompt-family__board-action">
            <DecisionViewBoardButton onOpenBoard={openBoard} />
          </div>
        </div>
      </div>
    </Scrim>
  );
}
