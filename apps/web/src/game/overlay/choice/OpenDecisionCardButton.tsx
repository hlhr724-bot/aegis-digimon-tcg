import { useState } from "react";
import { CardZoomOverlay } from "@/game/overlay/viewer/CardZoomOverlay";
import { useCardOpener } from "@/game/cardLinks";
import { useTranslation } from "@/i18n";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";

import { Icons } from "@/design/icons";

type Params = { cardId?: string; artId?: string };

export function OpenDecisionCardButton({ cardId, artId }: Params) {
  const openCard = useCardOpener();
  const [inspecting, setInspecting] = useState(false);
  const getCardName = useTranslatedCardName();
  const { t } = useTranslation();
  if (!cardId) {
    return null;
  }
  return (
    <>
      <button
        type="button"
        className="decision-card-inspect"
        aria-label={t("feed.openCard", { card: getCardName(cardId) })}
        title={t("feed.openCard", { card: getCardName(cardId) })}
        onClick={() => {
          if (openCard) {
            openCard(cardId, artId);
          } else {
            setInspecting(true);
          }
        }}
      >
        <Icons.Search size={18} aria-hidden="true" />
      </button>
      {inspecting ? <CardZoomOverlay cardId={cardId} artId={artId} onClose={() => setInspecting(false)} /> : null}
    </>
  );
}
