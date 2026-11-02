import { CardFull } from "@/design/cards";
import { useTranslation } from "@/i18n/useTranslation";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import type { BoxPull } from "@/packOpening/boosterTab/BoxPull";
import { getPackCardKey } from "@/packOpening/getPackCardKey";

type BoosterBestPullsParams = {
  pulls: readonly BoxPull[];
};

export function BoosterBestPulls({ pulls }: BoosterBestPullsParams) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  return (
    <section className="booster-card" aria-labelledby="booster-best-title">
      <header className="booster-card__header">
        <h2 id="booster-best-title">{t("redesign.collection.booster.best.title")}</h2>
      </header>
      <div className="booster-card__content">
        {pulls.length === 0 ? (
          <p className="booster-card__empty">{t("redesign.collection.booster.best.empty")}</p>
        ) : (
          <ol className="booster-best">
            {pulls.map(({ card, packNumber }, index) => (
              <li key={getPackCardKey(card)} className="booster-best__row">
                <span className="booster-best__position">{index + 1}</span>
                <span className="booster-best__thumb">
                  <CardFull cardId={card.cardId} artId={card.artId} width={40} />
                </span>
                <div className="booster-best__copy">
                  <b>{getCardName(card.cardId)}</b>
                  <small>
                    {card.artId
                      ? t("redesign.collection.booster.best.alternatePack", { number: packNumber })
                      : t("redesign.collection.booster.packNumber", { number: packNumber })}
                  </small>
                </div>
                <span className="booster-badge">{card.rarity}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
