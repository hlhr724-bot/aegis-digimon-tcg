import { CardFull } from "@/design/cards";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";

type Props = { cards: readonly string[]; title: string };

export function RankedDeckCardList({ cards, title }: Props) {
  const getName = useTranslatedCardName();
  const counts = new Map<string, number>();
  for (const card of cards) {
    counts.set(card, (counts.get(card) ?? 0) + 1);
  }
  return (
    <section className="ranked-deck-cards">
      <h5>{title}</h5>
      <ul>
        {[...counts.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([card, count]) => (
            <li key={card}>
              <CardFull cardId={card} width={88} zoomOnHover={false} />
              <span>
                {count} × {getName(card)}
              </span>
            </li>
          ))}
      </ul>
    </section>
  );
}
