import type { ReactNode } from "react";
import { CardMini } from "@/design/cards";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useCardOpener } from "@/game/cardLinks";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useTranslation } from "@/i18n/useTranslation";
import { DecisionCandidateGrid } from "@/game/overlay/choice/DecisionCandidateGrid";
import { DecisionViewBoardButton } from "@/game/overlay/choice/DecisionViewBoardButton";
import type { DecisionCandidate } from "@/game/overlay/choice/decisionTypes";

type Params = {
  sourceCardId?: string;
  effectText?: ReactNode;
  contextText?: string;
  candidates: readonly DecisionCandidate[];
  picks: readonly string[];
  min: number;
  max: number;
  canConfirm: boolean;
  onTogglePick: (instanceId: string) => void;
  onConfirm: () => void;
  onPass: () => void;
  onOpenBoard: () => void;
};

export function DecisionAttackTarget({
  sourceCardId,
  effectText,
  contextText,
  candidates,
  picks,
  min,
  max,
  canConfirm,
  onTogglePick,
  onConfirm,
  onPass,
  onOpenBoard,
}: Params) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const openCard = useCardOpener();
  return (
    <>
      <header className="attack-target__header">
        {sourceCardId ? (
          <button
            type="button"
            className="attack-target__source"
            aria-label={t("feed.openCard", { card: getCardName(sourceCardId) })}
            onClick={() => openCard?.(sourceCardId)}
            disabled={!openCard}
          >
            <CardMini cardId={sourceCardId} width={44} zoomOnHover={false} />
          </button>
        ) : null}
        <div className="attack-target__heading">
          {sourceCardId ? <p className="attack-target__card-name">{getCardName(sourceCardId)}</p> : null}
          <h2>{t("overlay.declareAttack")}</h2>
          {contextText ? <p className="attack-target__context">{contextText}</p> : null}
        </div>
        <DecisionViewBoardButton onOpenBoard={onOpenBoard} compact />
      </header>
      {effectText ? (
        <details className="attack-target__effect">
          <summary tabIndex={0}>
            {t("overlay.printedEffect")}
            <Icons.ChevronDown size={14} aria-hidden="true" />
          </summary>
          <p>{effectText}</p>
        </details>
      ) : null}
      <DecisionCandidateGrid
        candidates={candidates}
        picks={picks}
        min={min}
        max={max}
        selectedPlayCost={0}
        withinPlayCostBudget
        selectedDP={0}
        onTogglePick={onTogglePick}
      />
      <footer className="attack-target__actions">
        {min === 0 ? (
          <Button variant="secondary" onClick={onPass}>
            {t("overlay.passNoSelection")}
          </Button>
        ) : null}
        <Button icon={Icons.Swords} disabled={!canConfirm} onClick={onConfirm}>
          {t("overlay.declareAttack")}
        </Button>
      </footer>
    </>
  );
}
