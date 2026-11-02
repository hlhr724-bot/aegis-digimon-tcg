import { useState, type ReactNode } from "react";
import type { RankedSeason, RankedStanding } from "@aegis/shared/ranked/RankedContracts";
import { useTranslation } from "@/i18n/useTranslation";
import { Button, type PlayerIdentity } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { RankedCosmeticPreview } from "@/ranked/RankedCosmeticPreview";
import { getRankedSeasonProgress } from "@/ranked/getRankedSeasonProgress";
import { getNextRankedTier } from "@/ranked/getNextRankedTier";
import { getRankedTierFloor } from "@/ranked/getRankedTierFloor";
import { formatRankedWinrate } from "@/ranked/formatRankedWinrate";

type Props = {
  player?: PlayerIdentity;
  season?: RankedSeason;
  format: string;
  mine: RankedStanding | null;
  onPlay: () => void;
  formats?: ReactNode;
};
type MineProps = { mine: RankedStanding; player?: PlayerIdentity };
type GoalProps = { rating: number; tier: RankedStanding["tier"] };
type WeekStateParams = { index: number; week: number; ended: boolean };

const QUALIFICATION_GAMES = 10;

export function RankedSeasonHero({ player, season, format, mine, onPlay, formats }: Props) {
  const { t, locale } = useTranslation();
  const [now] = useState(Date.now);
  const progress = season ? getRankedSeasonProgress({ season, now }) : null;
  const day = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <header className="ranked-hero">
      <div className="ranked-hero__season">
        <p className="ranked-eyebrow">
          {t("ranked.season.title")} · {format === "standard" ? "Standard" : format}
        </p>
        <h2 className="ranked-hero__title">
          {season ? t("ranked.season.number", { number: season.id }) : t("ranked.season.title")}
        </h2>
        {season ? (
          <p className="ranked-hero__dates">
            {day.format(season.startsAt)} – {day.format(season.endsAt)} · {t("ranked.season.duration")}
          </p>
        ) : null}
        {progress ? (
          <>
            <ol className="ranked-weeks" aria-hidden="true">
              {Array.from({ length: progress.weeks }, (_, index) => (
                <li key={index} data-state={getWeekState({ index, week: progress.week, ended: progress.ended })} />
              ))}
            </ol>
            <div className="ranked-hero__clock">
              <span>
                {progress.ended
                  ? t("ranked.season.ended")
                  : t("ranked.season.week", { week: progress.week, weeks: progress.weeks })}
              </span>
              {progress.ended ? null : (
                <span>
                  {t("ranked.season.daysLeft")} <strong>{progress.daysLeft}</strong>
                </span>
              )}
            </div>
          </>
        ) : null}
      </div>
      <section className="ranked-mine" aria-label={t("ranked.season.mine")}>
        <p className="ranked-eyebrow">{t("ranked.season.mine")}</p>
        {mine ? (
          <RankedMineSummary mine={mine} player={player} />
        ) : (
          <p className="ranked-mine__empty">{t("ranked.season.qualifying")}</p>
        )}
        <div className="ranked-mine__action">
          <Button onClick={onPlay}>
            {t("ranked.season.play")}
            <span aria-hidden="true">
              <Icons.ArrowRight size={18} />
            </span>
          </Button>
          <span>{t("ranked.season.clockShort")}</span>
        </div>
      </section>
      {formats}
    </header>
  );
}

function RankedMineSummary({ mine, player }: MineProps) {
  const { t, locale } = useTranslation();
  const games = Math.min(QUALIFICATION_GAMES, mine.games);
  return (
    <div className="ranked-mine__body">
      <div className="ranked-mine__tier" data-tier={mine.tier}>
        <RankedCosmeticPreview
          tier={mine.tier}
          player={player ?? { name: mine.displayName, color: "Blue", shards: 0 }}
        />
        <strong>{t(`ranked.tier.${mine.tier}`)}</strong>
      </div>
      <dl className="ranked-mine__stats">
        <div className="ranked-mine__headline">
          <dt>{t("ranked.season.position")}</dt>
          <dd>{mine.position === null ? "—" : `#${mine.position}`}</dd>
        </div>
        <div className="ranked-mine__headline">
          <dt>{t("ranked.season.rating")}</dt>
          <dd>{mine.rating.toLocaleString(locale)}</dd>
        </div>
        <div className="ranked-mine__goal">
          {mine.provisional ? (
            <>
              <dt>{t("ranked.season.qualification")}</dt>
              <dd>
                <span>
                  {games} / {QUALIFICATION_GAMES}
                </span>
                <progress max={QUALIFICATION_GAMES} value={games} />
              </dd>
            </>
          ) : (
            <RankedTierGoal rating={mine.rating} tier={mine.tier} />
          )}
        </div>
        <div className="ranked-mine__record">
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
    </div>
  );
}

function RankedTierGoal({ rating, tier }: GoalProps) {
  const { t, locale } = useTranslation();
  const next = getNextRankedTier(rating);
  if (!next) {
    return (
      <>
        <dt>{t("ranked.season.tier")}</dt>
        <dd>{t("ranked.season.topTier")}</dd>
      </>
    );
  }
  const floor = getRankedTierFloor(tier);
  return (
    <>
      <dt>
        {t("ranked.season.nextTier", {
          tier: t(`ranked.tier.${next.value}`),
          rating: next.minimum.toLocaleString(locale),
        })}
      </dt>
      <dd>
        <span>+{(next.minimum - rating).toLocaleString(locale)}</span>
        <progress data-tier={next.value} max={next.minimum - floor} value={Math.max(0, rating - floor)} />
      </dd>
    </>
  );
}

function getWeekState({ index, week, ended }: WeekStateParams) {
  if (ended || index < week - 1) {
    return "done";
  }
  if (index === week - 1) {
    return "current";
  }
  return "upcoming";
}
