import { type Permanent } from "@aegis/shared";
import { Button } from "../design/primitives";
import { useTranslation } from "../i18n";
import { BoardPromptRail } from "./BoardDecisionRail";
import { useBoardPreview } from "./overlay/choice/useBoardPreview";
import { DecisionViewBoardButton } from "./overlay/choice/DecisionViewBoardButton";
import { dnaFieldChoice } from "./screen/model/dnaMaterialSelection";
import type { ProjectedDnaDigivolveRoute } from "./digivolveModel";
import "./DnaMaterialChoiceOverlay.css";

/** Material identities are picked on the field; this compact rail confirms the exact server route. */
export function DnaMaterialChoiceOverlay({
  routes,
  permanents,
  pickedPermanentIds,
  disabled = false,
  onConfirm,
  onNormalEvolution,
  onNormalPlay,
  onCancel,
}: {
  routes: readonly ProjectedDnaDigivolveRoute[];
  permanents: readonly Permanent[];
  pickedPermanentIds: readonly string[];
  disabled?: boolean;
  onConfirm: (materialPermanentIds: string[]) => void;
  onNormalEvolution?: () => void;
  onNormalPlay?: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { isViewingBoard, openBoard, boardReturn } = useBoardPreview();
  const choice = dnaFieldChoice(routes, permanents, pickedPermanentIds);
  if (isViewingBoard) return boardReturn;
  return (
    <BoardPromptRail
      variant="field-selection"
      className="dna-material-choice"
      label={t("overlay.confirmDnaTitle")}
      eyebrow="DNA"
      prompt={t(choice.selected ? "overlay.dnaConfirmMaterials" : "overlay.dnaSelectOnField")}
      budgetText={
        choice.available
          ? t("overlay.dnaSelectionCount", { count: pickedPermanentIds.length })
          : t("overlay.dnaUnavailable")
      }
      onOpenDialog={onCancel}
    >
      {choice.selected ? (
        <p className="dna-material-choice__cost" role="status">
          {t("overlay.appFusionCost", { cost: choice.selected.projectedCost })} · {t("overlay.dnaStackOrder")}
        </p>
      ) : null}
      {onNormalEvolution ? (
        <Button variant="secondary" onClick={onNormalEvolution}>
          {t("overlay.digivolveNormally")}
        </Button>
      ) : null}
      {onNormalPlay ? (
        <Button variant="secondary" disabled={disabled} onClick={onNormalPlay}>
          {t("overlay.playNormally")}
        </Button>
      ) : null}
      <div className="dna-material-choice__actions">
        <Button variant="secondary" data-arena-cancel onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={disabled || !choice.selected}
          onClick={() => choice.selected && onConfirm([...choice.selected.materialPermanentIds])}
        >
          {t("overlay.confirmDna")}
        </Button>
      </div>
      <DecisionViewBoardButton onOpenBoard={openBoard} />
    </BoardPromptRail>
  );
}
