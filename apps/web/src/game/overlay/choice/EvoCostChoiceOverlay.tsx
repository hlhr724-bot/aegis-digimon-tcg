import { Button } from "../../../design/primitives";
import { CardMini } from "../../../design/cards";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { useEffect, useRef } from "react";
import { BoardPromptRail, ViewBoardButton } from "../../BoardDecisionRail";
import type { EvoCostOption } from "../../digivolveModel";
import { predictedMemory } from "../../memoryArc";
import { printedCardName } from "../printedCardName";
import { useBoardPreview } from "./useBoardPreview";

const ROUTE_CARD_WIDTH = 72;

export function EvoCostChoiceOverlay({
  evolvingCardId,
  baseCardId,
  memory,
  options,
  onConfirm,
  onCancel,
}: {
  evolvingCardId: string;
  baseCardId: string;
  /** The viewer's memory before paying, signed from the viewer's side. */
  memory: number;
  options: readonly EvoCostOption[];
  /** Receives the whole path, not just "is it alternate": a card can print several alternate
   * paths at different costs, and only the path's own index tells the server which one. */
  onConfirm: (option: EvoCostOption) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { isViewingBoard, openBoard, boardReturn } = useBoardPreview();
  const optionsRef = useRef<HTMLDivElement>(null);
  // The "View board" button that held focus unmounts with the rail, so focus comes back
  // to the cheapest cost rather than being lost to the page.
  useEffect(() => {
    if (!isViewingBoard) optionsRef.current?.querySelector("button")?.focus();
  }, [isViewingBoard]);
  if (isViewingBoard) return boardReturn;

  const byCost = [...options].sort((a, b) => a.cost - b.cost);
  return (
    <BoardPromptRail
      variant="prompt"
      className="evo-cost-prompt"
      label={t("overlay.digivolveCost")}
      eyebrow={t("overlay.digivolveCost")}
      prompt={`${printedCardName(baseCardId)} → ${printedCardName(evolvingCardId)}`}
    >
      <div className="evo-cost-prompt__route" aria-hidden>
        <CardMini cardId={baseCardId} width={ROUTE_CARD_WIDTH} zoomOnHover={false} />
        <Icons.ArrowRight size={22} className="evo-cost-prompt__route-arrow" />
        <CardMini cardId={evolvingCardId} width={ROUTE_CARD_WIDTH} zoomOnHover={false} />
      </div>
      <div className="evo-cost-prompt__options" ref={optionsRef}>
        {byCost.map((opt, index) => {
          const after = predictedMemory(memory, opt.cost);
          return (
            <Button
              key={`${opt.type}:${opt.alternateRequirementIndex ?? -1}:${opt.label}`}
              className="evo-cost-prompt__option"
              variant="secondary"
              data-recommended={index === 0 || undefined}
              data-passes-turn={after < 0 || undefined}
              // The tile shows only the cost and where memory lands; the name keeps the path
              // so assistive tech can still tell apart two paths with the same cost.
              aria-label={t("overlay.costMemoryOutcome", { label: opt.label, cost: opt.cost, from: memory, to: after })}
              onClick={() => onConfirm(opt)}
            >
              <span className="evo-cost-prompt__cost">{opt.cost}</span>
              <span className="evo-cost-prompt__unit">{t("overlay.memoryUnit")}</span>
              <span className="evo-cost-prompt__outcome">
                {memory} → {after}
              </span>
            </Button>
          );
        })}
      </div>
      <div className="evo-cost-prompt__footer">
        <Button variant="ghost" data-arena-cancel onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <ViewBoardButton onClick={openBoard} />
      </div>
    </BoardPromptRail>
  );
}
