import type { ReactNode } from "react";
import { Button } from "../../../design/primitives";
import { useTranslation } from "../../../i18n";
import { BoardPromptRail } from "../../BoardDecisionRail";
import { useBoardPreview } from "../choice/useBoardPreview";
import { DecisionViewBoardButton } from "../choice/DecisionViewBoardButton";

/** A keyword's original rules, with use / decline and a way to inspect the board. */
export function KeywordSavePrompt({
  keyword,
  rulesText,
  permanentId,
  affected,
  onAccept,
  onDecline,
}: {
  keyword: string;
  rulesText: string;
  permanentId?: string;
  affected?: ReactNode;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  const { isViewingBoard, openBoard, boardReturn } = useBoardPreview();
  if (isViewingBoard) return boardReturn;
  return (
    <BoardPromptRail
      variant="prompt"
      className="keyword-save-overlay"
      sourcePermanentId={permanentId}
      affected={affected}
      label={keyword}
      prompt={keyword}
      clause={rulesText}
      clauseLang="en"
    >
      <Button full onClick={onAccept}>
        {t("overlay.use")}
      </Button>
      <Button full variant="secondary" onClick={onDecline}>
        {t("overlay.notUse")}
      </Button>
      <DecisionViewBoardButton onOpenBoard={openBoard} />
    </BoardPromptRail>
  );
}
