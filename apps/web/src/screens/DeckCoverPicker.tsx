import { CardFull } from "@/design/cards";
import { Icons } from "@/design/icons";
import { Dialog, IconButton } from "@/design/primitives";
import { useTranslation } from "@/i18n";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import "@/screens/deckCoverPicker.css";

type Params = {
  cardIds: readonly string[];
  coverCardId: string | undefined;
  arts: Readonly<Record<string, string[]>>;
  onChoose: (cardId: string) => void;
  onClose: () => void;
};

export function DeckCoverPicker({ cardIds, coverCardId, arts, onChoose, onClose }: Params) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  return (
    <Dialog className="deck-cover-picker" labelledBy="deck-cover-picker-title" onClose={onClose}>
      <header className="deck-cover-picker__header">
        <h2 id="deck-cover-picker-title">{t("deck.changeCover")}</h2>
        <IconButton variant="ghost" size="sm" label={t("common.close")} onClick={onClose}>
          <Icons.X size={18} />
        </IconButton>
      </header>
      <div className="deck-cover-picker__grid">
        {[...new Set(cardIds)].map((cardId) => (
          <button
            key={cardId}
            type="button"
            className="deck-cover-picker__card"
            aria-label={`${getCardName(cardId)} · ${cardId}`}
            aria-pressed={coverCardId === cardId}
            onClick={() => onChoose(cardId)}
          >
            <CardFull cardId={cardId} artId={arts[cardId]?.[0]} width={120} zoomOnHover={false} />
            <span>{getCardName(cardId)}</span>
            <small>{cardId}</small>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
