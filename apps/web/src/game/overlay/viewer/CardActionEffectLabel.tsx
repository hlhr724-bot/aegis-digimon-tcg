import { useTranslation } from "@/i18n/useTranslation";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { useTranslatedCardText } from "@/i18n/useTranslatedCardText";
import type { CardActionEffect } from "@/game/overlay/viewer/cardActionMenuTypes";

export function CardActionEffectLabel({
  effect,
  cardId,
  position,
  total,
}: {
  effect: CardActionEffect;
  cardId?: string;
  position: number;
  total: number;
}) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const translateCardText = useTranslatedCardText();
  const sourceCardId = effect.sourceCardId ?? cardId;
  const text = translateCardText({ text: effect.label, cardId: sourceCardId });
  return (
    <span title={sourceCardId ? `${getCardName(sourceCardId)}: ${text}` : text}>
      {t("game.activateMainEffect")}
      {total > 1 ? ` ${position}` : ""}
    </span>
  );
}
