import type { DecisionResponse } from "@aegis/shared";
import { EffectText } from "../../EffectText";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { choiceLabel } from "./decisionChoiceLabels";
import { DecisionViewBoardButton } from "./DecisionViewBoardButton";

/**
 * A `chooseOption` over the bullets of one printed clause ("Activate 1 of the effects
 * below"). Each option is a row carrying its whole printed bullet, so the player reads the
 * card's words instead of an engine summary such as "Delete 1 target(s)".
 */
export function DecisionClauseChoice({
  choices,
  choiceClauses,
  cardId,
  declineIndex,
  activation,
  onRespond,
  onOpenBoard,
}: {
  choices: readonly string[];
  /** Aligned to `choices`; an empty entry has no printed bullet and falls back to its label. */
  choiceClauses: readonly string[];
  cardId?: string;
  declineIndex?: number;
  activation?: { index: number; total: number };
  onRespond: (response: DecisionResponse) => void;
  onOpenBoard: () => void;
}) {
  const { t } = useTranslation();
  const hasDecline = declineIndex !== undefined && declineIndex >= 0 && declineIndex < choices.length;
  return (
    <div className="decision-overlay__choice-layout">
      {activation && activation.total > 1 ? (
        <p className="effect-choice__activation">
          {t("overlay.activationProgress", { index: activation.index, total: activation.total })}
        </p>
      ) : null}
      <ol className="effect-choice" aria-label={t("overlay.chooseEffectPrompt")}>
        {choices.map((label, index) => {
          if (hasDecline && index === declineIndex) return null;
          const clause = choiceClauses[index];
          return (
            <li key={index}>
              <button
                type="button"
                className="effect-choice__option effect-choice__option--clause"
                onClick={() => onRespond({ kind: "chooseOption", optionIndex: index })}
              >
                <span className="effect-choice__index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="effect-choice__clause">
                  {clause ? (
                    <EffectText text={clause} cardId={cardId} surface="clause-choice" allowContext />
                  ) : (
                    choiceLabel({ choice: label, t })
                  )}
                </span>
                <span className="effect-choice__go" aria-hidden="true">
                  <Icons.ChevronRight />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="decision-overlay__footer decision-overlay__choices">
        {hasDecline ? (
          <Button
            full
            size="lg"
            variant="ghost"
            onClick={() => onRespond({ kind: "chooseOption", optionIndex: declineIndex })}
          >
            {t("overlay.notUse")}
          </Button>
        ) : null}
        <DecisionViewBoardButton onOpenBoard={onOpenBoard} />
      </div>
    </div>
  );
}
