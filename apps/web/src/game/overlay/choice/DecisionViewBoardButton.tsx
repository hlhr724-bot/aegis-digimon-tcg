import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { recordViewBoardOrigin } from "@/game/overlay/choice/recordViewBoardOrigin";

type Params = { onOpenBoard: () => void; compact?: boolean };

export function DecisionViewBoardButton({ onOpenBoard, compact = false }: Params) {
  const { t } = useTranslation();
  return (
    <Button
      className={`decision-overlay__view-board${compact ? " decision-overlay__view-board--compact" : ""}`}
      aria-label={t("overlay.viewBoard")}
      title={compact ? t("overlay.viewBoard") : undefined}
      size={compact ? "sm" : "lg"}
      variant="secondary"
      icon={Icons.Map}
      onClick={(event) => {
        recordViewBoardOrigin({ element: event.currentTarget });
        onOpenBoard();
      }}
    >
      {compact ? null : <span className="decision-overlay__view-board-label">{t("overlay.viewBoard")}</span>}
    </Button>
  );
}
