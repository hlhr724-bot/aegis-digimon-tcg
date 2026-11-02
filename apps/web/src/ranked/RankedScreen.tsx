import type { DeckFormat } from "@aegis/shared/deckFormat";
import { RewardGiftIcon } from "@/design/RewardGiftIcon";
import { RankedFormatCards } from "@/ranked/RankedFormatCards";
import { RankedMetaPanel } from "@/ranked/RankedMetaPanel";
import { useState } from "react";
import type { RankedLeaderboard, RankedSeason } from "@aegis/shared/ranked/RankedContracts";
import { RankedRegion } from "@aegis/shared/ranked/RankedRegion";
import { useTranslation } from "@/i18n/useTranslation";
import { Button, type PlayerIdentity, type Screen } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useRankedRequest } from "@/ranked/useRankedRequest";
import { RankedLeaderboardTable } from "@/ranked/RankedLeaderboardTable";
import { RankedRewardsPanel } from "@/ranked/RankedRewardsPanel";
import { RankedMatchupsPanel } from "@/ranked/RankedMatchupsPanel";
import { RankedReportsPanel } from "@/ranked/RankedReportsPanel";
import { RankedTab } from "@/ranked/RankedTab";
import { RankedSeasonHero } from "@/ranked/RankedSeasonHero";
import { PlayHeader } from "@/play/PlayHeader";
import { PlayTab } from "@/play/PlayTab";
import "@/ranked/ranked.css";

const tabIcons = {
  [RankedTab.LEADERBOARD.value]: Icons.Trophy,
  [RankedTab.MATCHUPS.value]: Icons.Swords,
  [RankedTab.REWARDS.value]: RewardGiftIcon,
  [RankedTab.META.value]: Icons.LayoutDashboard,
  [RankedTab.REPORTS.value]: Icons.CircleAlert,
};

const LEADERBOARD_PAGE_SIZE = 50;

type Props = {
  player?: PlayerIdentity;
  signedIn: boolean;
  canJudge?: boolean;
  onPlay: () => void;
  onNav?: (screen: Screen) => void;
};

export function RankedScreen({ player, signedIn, canJudge = false, onPlay, onNav = () => undefined }: Props) {
  const { t, locale } = useTranslation();
  const [tab, setTab] = useState<RankedTab>(RankedTab.LEADERBOARD.value);
  const [format, setFormat] = useState<DeckFormat>("standard");
  const [region, setRegion] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [page, setPage] = useState(1);
  const seasons = useRankedRequest<RankedSeason[]>("/ranked/seasons");
  const query = new URLSearchParams({ format, page: String(page) });
  if (region) {
    query.set("region", region);
  }
  if (seasonId) {
    query.set("season", seasonId);
  }
  const board = useRankedRequest<RankedLeaderboard>(`/ranked/leaderboard?${query}`);
  const selectedSeason = seasons.data?.find((season) => String(season.id) === seasonId) ?? seasons.data?.[0];
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <main className="aegis-page play-page ranked-page">
      <div className="aegis-page__wrap">
        <PlayHeader activeTab={PlayTab.RANKED.value} rankedEnabled onNav={onNav} />
        <div className="ranked-shell">
          <RankedSeasonHero
            player={player}
            season={board.data?.season ?? selectedSeason}
            format={format}
            mine={board.data?.mine ?? null}
            onPlay={onPlay}
            formats={
              <RankedFormatCards
                season={board.data?.season ?? selectedSeason}
                seasons={seasons.data ?? []}
                format={format}
              />
            }
          />
          <div className="ranked-toolbar">
            <nav className="ranked-tabs" aria-label={t("ranked.season.title")}>
              {Object.values(RankedTab).map((entry) => {
                const Icon = tabIcons[entry.value];
                return (
                  <button
                    key={entry.value}
                    type="button"
                    aria-pressed={entry.value === tab}
                    onClick={() => setTab(entry.value)}
                  >
                    <span aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    {t(`ranked.season.${entry.value}`)}
                  </button>
                );
              })}
            </nav>
            {tab === RankedTab.LEADERBOARD.value || tab === RankedTab.MATCHUPS.value || tab === RankedTab.META.value ? (
              <div className="ranked-filters">
                {tab !== RankedTab.MATCHUPS.value ? (
                  <label>
                    <span>{t("ranked.season.title")}</span>
                    <select
                      value={seasonId || String(seasons.data?.[0]?.id ?? "")}
                      onChange={(event) => {
                        setSeasonId(event.target.value);
                        const season = seasons.data?.find((entry) => String(entry.id) === event.target.value);
                        setFormat(season?.formats[0] ?? "standard");
                        setPage(1);
                      }}
                    >
                      {seasons.data?.map((season) => (
                        <option key={season.id} value={season.id}>
                          {t("ranked.season.number", { number: season.id })} · {date.format(season.startsAt)} –{" "}
                          {date.format(season.endsAt)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  <span>{t("ranked.season.format")}</span>
                  <select
                    value={format}
                    onChange={(event) => {
                      setFormat(event.target.value as DeckFormat);
                      setPage(1);
                    }}
                  >
                    {(selectedSeason?.formats ?? ["standard"]).map((value) => (
                      <option key={value} value={value}>
                        {value === "standard" ? "Standard" : value}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("ranked.season.region")}</span>
                  <select
                    value={region}
                    onChange={(event) => {
                      setRegion(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">{t("ranked.season.allRegions")}</option>
                    {Object.values(RankedRegion).map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {t(`ranked.region.${entry.value}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
          {tab === RankedTab.LEADERBOARD.value ? (
            <section className="ranked-panel" aria-label={t("ranked.season.leaderboard")}>
              {board.error || seasons.error ? (
                <p role="alert" className="ranked-alert">
                  {t("ranked.season.error")}{" "}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      board.refresh();
                      seasons.refresh();
                    }}
                  >
                    {t("ranked.season.retry")}
                  </Button>
                </p>
              ) : null}
              {!board.data && !board.error ? <p role="status">{t("common.loading")}</p> : null}
              {board.data ? (
                <>
                  <RankedLeaderboardTable format={format} data={board.data} />
                  {page > 1 || board.data.total > LEADERBOARD_PAGE_SIZE ? (
                    <div className="ranked-pagination">
                      <Button variant="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
                        {t("ranked.season.previous")}
                      </Button>
                      <span>{page}</span>
                      <Button
                        variant="secondary"
                        disabled={page * LEADERBOARD_PAGE_SIZE >= board.data.total}
                        onClick={() => setPage((value) => value + 1)}
                      >
                        {t("ranked.season.next")}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}
          {tab === RankedTab.MATCHUPS.value ? (
            <RankedMatchupsPanel key={`${format}:${region}`} format={format} region={region} />
          ) : null}
          {tab === RankedTab.META.value ? (
            <RankedMetaPanel
              key={`${format}:${region}:${selectedSeason?.id}`}
              season={selectedSeason}
              format={format}
              region={region}
            />
          ) : null}
          {tab === RankedTab.REWARDS.value ? (
            <RankedRewardsPanel player={player} signedIn={signedIn} currentTier={board.data?.mine?.tier} />
          ) : null}
          {tab === RankedTab.REPORTS.value ? <RankedReportsPanel signedIn={signedIn} canJudge={canJudge} /> : null}
          <p className="ranked-footnote">{t("ranked.season.context")}</p>
        </div>
      </div>
    </main>
  );
}
