import type { MatchWinRate } from "@aegis/shared/replays";
import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";

type Props = { label: TranslationKey; rate: MatchWinRate | null; difference?: number };

export function DeckHistoryRate({ label, rate, difference }: Props) {
  const { t, locale } = useTranslation();
  const percentage = rate?.matches ? (rate.wins / rate.matches) * 100 : undefined;
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return (
    <div className="profile-deck-overview__rate">
      <h4>{t(label)}</h4>
      <div className="profile-deck-overview__value">
        <strong>{percentage === undefined ? "—" : `${formatter.format(percentage)}%`}</strong>
        {difference !== undefined ? (
          <span className="profile-deck-overview__difference" data-positive={difference >= 0}>
            {t("profile.deckStats.delta", { value: `${difference > 0 ? "+" : ""}${formatter.format(difference)}` })}
          </span>
        ) : null}
      </div>
      <p>{rate ? t("profile.deckStats.matchCount", { count: rate.matches }) : t("profile.deckStats.unavailable")}</p>
      {rate ? (
        <>
          <dl className="profile-deck-overview__record">
            <div data-result="win">
              <dt>{t("profile.filter.win")}</dt>
              <dd>{rate.wins}</dd>
            </div>
            <div data-result="loss">
              <dt>{t("profile.filter.loss")}</dt>
              <dd>{rate.losses}</dd>
            </div>
            <div data-result="draw">
              <dt>{t("profile.filter.draw")}</dt>
              <dd>{rate.draws}</dd>
            </div>
          </dl>
          {rate.matches > 0 ? (
            <div className="profile-deck-overview__distribution" aria-hidden="true">
              <span data-result="win" style={{ flexGrow: rate.wins }} />
              <span data-result="loss" style={{ flexGrow: rate.losses }} />
              <span data-result="draw" style={{ flexGrow: rate.draws }} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
