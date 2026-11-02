import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useTranslatedCardText } from "@/i18n/useTranslatedCardText";
import type { DecisionResponse } from "@aegis/shared";
import { EffectText } from "../../EffectText";
import { CardFull } from "../../../design/cards";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { playerFacingEffectClause, printedTimingLabel } from "../effectText";

import { DecisionViewBoardButton } from "./DecisionViewBoardButton";

export interface EffectChoice {
  cardId: string;
  timing?: string;
  isInherited?: boolean;
}

/**
 * A `chooseOption` whose choices are printed effects of a card (Rina activating one of
 * UlforceVeedramon's [When Digivolving] effects). Each option is one row: the card's art,
 * its name and the full printed clause, so the player reads the effect rather
 * than an engine summary.
 */
export function DecisionEffectChoice({
  choices,
  choiceEffects,
  wideDialog,
  onRespond,
  onOpenBoard,
}: {
  choices: readonly string[];
  choiceEffects: readonly EffectChoice[];
  wideDialog: boolean;
  onRespond: (response: DecisionResponse) => void;
  onOpenBoard: () => void;
}) {
  const getCardName = useTranslatedCardName();
  const translateCardText = useTranslatedCardText();
  const { t } = useTranslation();
  return (
    <div className="decision-overlay__choice-layout">
      <ol className="effect-choice" aria-label={t("overlay.chooseEffectPrompt")}>
        {choices.map((label, index) => {
          const effect = choiceEffects[index];
          if (effect === undefined) return null;
          const clause =
            playerFacingEffectClause({
              cardId: effect.cardId,
              timing: effect.timing,
              description: label,
              isInherited: effect.isInherited,
            }) ?? label;
          const printedTiming = printedTimingLabel(effect.timing);
          const timingLabel = printedTiming ? translateCardText({ text: printedTiming }) : undefined;
          const name = getCardName(effect.cardId);
          return (
            <li key={index}>
              <button
                type="button"
                className="effect-choice__option"
                aria-label={[timingLabel, name].filter(Boolean).join(", ")}
                onClick={() => onRespond({ kind: "chooseOption", optionIndex: index })}
              >
                <span className="effect-choice__index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="effect-choice__art">
                  <CardFull cardId={effect.cardId} width={wideDialog ? 64 : 52} />
                </span>
                <span className="effect-choice__body">
                  <span className="effect-choice__title">
                    <span className="effect-choice__name">{name}</span>
                    <span className="effect-choice__id">{effect.cardId}</span>
                    {timingLabel && <span className="effect-choice__timing">{timingLabel}</span>}
                  </span>
                  <span className="effect-choice__clause">
                    <EffectText
                      text={clause}
                      cardId={effect.cardId}
                      timing={effect.timing}
                      surface="effect-choice"
                      allowContext
                    />
                  </span>
                </span>
                <span className="effect-choice__go" aria-hidden="true">
                  <Icons.ChevronRight />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="trigger-chooser__footer">
        <span />
        <DecisionViewBoardButton onOpenBoard={onOpenBoard} />
      </div>
    </div>
  );
}
