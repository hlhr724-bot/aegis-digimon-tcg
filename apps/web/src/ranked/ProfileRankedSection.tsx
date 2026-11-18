import type { RankedLeaderboard } from "@aegis/shared/ranked/RankedContracts";
import { useTranslation } from "@/i18n/useTranslation";
import { RankedTierEmblem } from "@/ranked/RankedTierEmblem";
import { formatRankedWinrate } from "@/ranked/formatRankedWinrate";
import { getRankedSeasonLabel } from "@/ranked/getRankedSeasonLabel";
import { useRankedRequest } from "@/ranked/useRankedRequest";
import { pathForRoute } from "@/routes";
import "@/ranked/ranked.css";

export function ProfileRankedSection() {
  const { t, locale } = useTranslation();
  const { data } = useRankedRequest<RankedLeaderboard>("/ranked/leaderboard", { poll: false });
  if (!data) {
    return null;
  }
  const { mine, season } = data;
  return (
    <section className="profile-ranked" aria-labelledby="profile-ranked-title">
      <header className="profile-history__header">
        <h2 id="profile-ranked-title">{t("ranked.season.title")}</h2>
        <span className="profile-history__count">{getRankedSeasonLabel({ seasonId: season.id, t })}</span>
        <a className="aegis-button aegis-button--secondary aegis-button--sm" href={pathForRoute({ screen: "ranked" })}>
          {t("home.next.rankedLink")}
        </a>
      </header>
      {mine ? (
        <dl className="profile-ranked__stats">
          <div>
            <dt>{t("ranked.season.tier")}</dt>
            <dd data-tier={mine.tier}>
              <RankedTierEmblem tier={mine.tier} />
              {t(`ranked.tier.${mine.tier}`)}
            </dd>
          </div>
          <div>
            <dt>{t("ranked.season.rating")}</dt>
            <dd>{mine.rating.toLocaleString(locale)}</dd>
          </div>
          <div>
            <dt>{t("ranked.season.position")}</dt>
            <dd>{mine.position === null ? "—" : `#${mine.position}`}</dd>
          </div>
          <div>
            <dt>{t("ranked.season.record")}</dt>
            <dd>
              {mine.wins} / {mine.losses} / {mine.draws}
            </dd>
          </div>
          <div>
            <dt>{t("ranked.season.winrate")}</dt>
            <dd>{formatRankedWinrate({ value: mine.winrate, locale })}</dd>
          </div>
          <div>
            <dt>{t("ranked.season.peak")}</dt>
            <dd>{(mine.peakRating ?? mine.rating).toLocaleString(locale)}</dd>
          </div>
        </dl>
      ) : (
        <p className="profile-history__state">{t("home.next.rankedEmpty")}</p>
      )}
    </section>
  );
}
