import { getCardDefinition } from "@aegis/shared";
import { useTranslation } from "@/i18n";
import { ActionConfirmationOverlay } from "@/game/overlay/choice/ActionConfirmationOverlay";
import { getOptionMainEffect } from "@/game/overlay/choice/getOptionMainEffect";

const IMMEDIATE_OPTION_PASSAGES: Partial<Record<string, string>> = {
  "BT25-057": "[Main] 1 of your Digimon gains ＜Rush＞ , ＜Security A. +1＞ and +5000 DP for the turn.",
};

export function DualPlayChoiceOverlay({
  cardId,
  onChoose,
  onCancel,
}: {
  cardId: string;
  onChoose: (useAs: "digimon" | "option") => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const optionEffect = getCardDefinition(cardId)?.optionEffect;
  return (
    <ActionConfirmationOverlay
      cardId={cardId}
      title={t("overlay.useAsOption")}
      detail={optionEffect ? getOptionMainEffect(optionEffect) : t("overlay.dualPlayDetail")}
      emphasis={IMMEDIATE_OPTION_PASSAGES[cardId]}
      confirmLabel={t("overlay.useAsOption")}
      onConfirm={() => onChoose("option")}
      onCancel={onCancel}
    />
  );
}
