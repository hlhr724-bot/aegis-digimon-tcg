import { useTranslation } from "@/i18n/useTranslation";
import { BOOSTER_BOX_PACK_COUNT } from "@/packOpening/BoosterProgress";
import type { BoosterOdds } from "@/packOpening/boosterTab/listBoosterOdds";
import type { Translate } from "@/i18n/translationTypes";

type BoosterOddsCardParams = {
  odds: readonly BoosterOdds[];
};

type DescribeOddsParams = {
  odds: BoosterOdds;
  t: Translate;
};

function describeOdds({ odds, t }: DescribeOddsParams) {
  if ("slotsPerPack" in odds) {
    const key = odds.isMinimum
      ? "redesign.collection.booster.odds.atLeast"
      : "redesign.collection.booster.odds.perPack";
    return <>{t(key, { count: odds.slotsPerPack })}</>;
  }
  return (
    <>{t("redesign.collection.booster.odds.oneIn", { count: Math.round(BOOSTER_BOX_PACK_COUNT / odds.perBox) })}</>
  );
}

export function BoosterOddsCard({ odds }: BoosterOddsCardParams) {
  const { t } = useTranslation();
  return (
    <section className="booster-card" aria-labelledby="booster-odds-title">
      <header className="booster-card__header">
        <h2 id="booster-odds-title">{t("redesign.collection.booster.odds.title")}</h2>
        <p>{t("redesign.collection.booster.odds.description")}</p>
      </header>
      <div className="booster-card__content">
        <dl className="booster-odds">
          {odds.map((entry) => (
            <div key={entry.kind.value}>
              <dt>{t(entry.kind.labelKey)}</dt>
              <dd>{describeOdds({ odds: entry, t })}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
