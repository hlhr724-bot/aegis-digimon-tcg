import { useTranslation } from "@/i18n/useTranslation";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useTranslatedCardText } from "@/i18n/useTranslatedCardText";
import type { CardActionEffect } from "@/game/overlay/viewer/cardActionMenuTypes";
import "@/game/overlay/viewer/cardActionEffectLabel.css";

export function CardActionEffectLabel({ effect, cardId }: { effect: CardActionEffect; cardId?: string }) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const translateCardText = useTranslatedCardText();
  const sourceCardId = effect.sourceCardId ?? cardId;
  const text = translateCardText({ text: effect.label, cardId: sourceCardId });
  return (
    <span className="card-action-effect-label" title={text}>
      <strong>
        {t("game.activateMainEffect")}
        {sourceCardId ? ` · ${getCardName(sourceCardId)}` : ""}
      </strong>
      <span>{text}</span>
    </span>
  );
}
