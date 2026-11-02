import { CardFull } from "@/design/cards";
import { useTranslation } from "@/i18n/useTranslation";
import { getPackCardKey } from "@/packOpening/getPackCardKey";
import type { PackCard } from "@/packOpening/PackCard";

type BoosterLastPackParams = {
  cards: readonly PackCard[];
  bestPull: PackCard | undefined;
  packNumber: number;
};

export function BoosterLastPack({ cards, bestPull, packNumber }: BoosterLastPackParams) {
  const { t } = useTranslation();
  return (
    <section className="booster-last-pack" aria-labelledby="booster-last-pack-title">
      <header className="booster-last-pack__header">
        <h3 id="booster-last-pack-title">{t("redesign.collection.booster.lastPack")}</h3>
        <small>{t("redesign.collection.booster.packNumber", { number: packNumber })}</small>
      </header>
      <ul className="booster-last-pack__grid">
        {cards.map((card, index) => (
          <li
            key={`${getPackCardKey(card)}-${index}`}
            className="booster-last-pack__card"
            data-best={card === bestPull || undefined}
          >
            <CardFull cardId={card.cardId} artId={card.artId} width={120} />
            <span className="booster-rarity-tag">
              {card.rarity}
              {card.artId ? " · AA" : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
