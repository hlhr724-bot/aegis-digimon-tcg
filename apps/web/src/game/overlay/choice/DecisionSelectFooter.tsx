import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { DecisionViewBoardButton } from "./DecisionViewBoardButton";

export function DecisionSelectFooter({
  canConfirm,
  confirmLabel,
  onConfirm,
  min,
  onNone,
  onDeclineCost,
  onCancelActivation,
  cancelLabel,
  onOpenBoard,
}: {
  canConfirm: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
  min: number;
  onNone: () => void;
  onDeclineCost?: () => void;
  onCancelActivation?: () => void;
  cancelLabel?: string;
  onOpenBoard: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="game-actions-row decision-overlay__footer decision-overlay__footer--selection">
      {onCancelActivation ? (
        <Button full size="lg" variant="ghost" onClick={onCancelActivation}>
          {cancelLabel ?? t("overlay.cancelActivation")}
        </Button>
      ) : onDeclineCost ? (
        <Button full size="lg" variant="ghost" onClick={onDeclineCost}>
          {t("overlay.notUse")}
        </Button>
      ) : min === 0 ? (
        <Button full size="lg" variant="ghost" onClick={onNone}>
          {t("common.none")}
        </Button>
      ) : null}
      <DecisionViewBoardButton onOpenBoard={onOpenBoard} />
      <Button full size="lg" icon={Icons.Check} disabled={!canConfirm} onClick={onConfirm}>
        {confirmLabel ?? t("overlay.confirmTargets")}
      </Button>
    </div>
  );
}
