import { Icons } from "@/design/icons";
import { HomeCard } from "@/home/HomeCard";
import { useTranslation } from "@/i18n/useTranslation";
import { LiveMatchCard } from "@/screens/LiveMatchCard";
import { useLiveMatches } from "@/screens/useLiveMatches";

const HOME_LIVE_MATCH_COUNT = 4;

type HomeLiveMatchesCardParams = {
  onWatch: (spectatorCode: string) => void;
  onViewAll: () => void;
};

export function HomeLiveMatchesCard({ onWatch, onViewAll }: HomeLiveMatchesCardParams) {
  const { t } = useTranslation();
  const { page } = useLiveMatches({ pageSize: HOME_LIVE_MATCH_COUNT });
  const matches = page?.matches ?? [];
  const now = Date.now();
  return (
    <HomeCard
      className="home-live"
      title={
        <>
          {t("spectator.liveTitle")}
          {page && page.total > 0 ? <span className="home-count-badge">{page.total}</span> : null}
        </>
      }
      description={t("home.live.description")}
      action={{ label: t("home.viewAll"), onClick: onViewAll }}
    >
      {matches.length === 0 ? (
        <div className="home-empty">
          <Icons.Eye size={22} aria-hidden="true" />
          <p>
            <strong>{t("spectator.liveEmpty")}</strong>
            <span>{t("spectator.liveEmptyHint")}</span>
          </p>
        </div>
      ) : (
        <ul className="home-rail home-live__grid">
          {matches.map((match) => (
            <LiveMatchCard key={match.spectatorCode} match={match} now={now} onWatch={onWatch} />
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
