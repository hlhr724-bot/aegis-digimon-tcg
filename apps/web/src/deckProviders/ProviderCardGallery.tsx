import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";

import { CardFull } from "@/design/cards";

type Props = {
  title: string;
  cards: string[];
};

export function ProviderCardGallery({ title, cards }: Props) {
  const getCardName = useTranslatedCardName();
  const counts = new Map<string, number>();
  for (const card of cards) {
    counts.set(card, (counts.get(card) ?? 0) + 1);
  }
  if (cards.length === 0) {
    return null;
  }
  return (
    <section className="provider-card-section" aria-label={title}>
      <h3>
        {title} <span>{cards.length}</span>
      </h3>
      <ul className="provider-card-gallery">
        {[...counts].map(([card, count]) => (
          <li key={card}>
            <CardFull cardId={card} width={120} count={count} />
            <strong>{getCardName(card)}</strong>
            <span>
              {card} · {count} ×
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
