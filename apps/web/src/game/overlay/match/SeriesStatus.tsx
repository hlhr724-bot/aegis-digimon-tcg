import type { CSSProperties } from "react";
import { SERIES_TURN_ORDER_SECONDS } from "@aegis/shared";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { formatMatchTime } from "../../MatchTimer";
import type { SeriesPip, SeriesView } from "../../seriesModel";
import "./seriesStatus.css";

const PIP_MARKS = {
  win: "overlay.series.pip.win",
  loss: "overlay.series.pip.loss",
  draw: "overlay.series.pip.draw",
} as const;

const PIP_LABELS = {
  win: "overlay.series.pipLabel.win",
  loss: "overlay.series.pipLabel.loss",
  draw: "overlay.series.pipLabel.draw",
  pending: "overlay.series.pipLabel.pending",
} as const satisfies Record<SeriesPip, string>;

/** Score and one pip per game, labeled from the viewer's side so no pip needs a legend. */
export function SeriesScore({ series, opponentName }: { series: SeriesView; opponentName: string }) {
  const { t } = useTranslation();
  return (
    <div className="series-score">
      <p
        className="series-score__line"
        aria-label={t("overlay.series.scoreLabel", {
          you: series.viewerWins,
          opponent: series.opponentWins,
          name: opponentName,
        })}
      >
        <span className="series-score__name">{t("overlay.series.you")}</span>
        <span className="series-score__value" aria-hidden="true">
          {series.viewerWins} – {series.opponentWins}
        </span>
        <span className="series-score__name">{opponentName}</span>
      </p>
      <ol className="series-score__pips">
        {series.pips.map((pip, index) => (
          <li key={index} className="series-score__pip" data-result={pip}>
            <span aria-hidden="true">{pip === "pending" ? "" : t(PIP_MARKS[pip])}</span>
            <span className="series-score__pip-label">{t(PIP_LABELS[pip], { game: index + 1 })}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The gap between two games: the loser picks the turn order against a visible clock, the
 * winner sees who is picking, and both see who starts once it is set.
 */
export function SeriesNextGame({
  series,
  opponentName,
  onChooseTurnOrder,
}: {
  series: SeriesView;
  opponentName: string;
  onChooseTurnOrder: (goFirst: boolean) => void;
}) {
  const { t } = useTranslation();
  const nextGame = series.gameNumber + 1;
  if (series.stage === "starting") {
    return (
      <div className="series-next" role="status">
        <p className="series-next__title">{getStartingTitle({ series, nextGame, opponentName, t })}</p>
        <p className="series-next__detail">{t("overlay.series.joining")}</p>
      </div>
    );
  }
  if (series.stage !== "choosing") return null;
  const countdown = (
    <div className="series-next__countdown">
      <span
        className="series-next__bar"
        style={
          {
            "--series-choice-left": series.choiceSecondsLeft,
            "--series-choice-total": SERIES_TURN_ORDER_SECONDS,
          } as CSSProperties
        }
        aria-hidden="true"
      />
      {series.viewerChooses ? (
        <span>{t("overlay.series.autoPick", { time: formatMatchTime(series.choiceSecondsLeft) })}</span>
      ) : null}
    </div>
  );
  if (!series.viewerChooses) {
    return (
      <div className="series-next" role="status">
        <p className="series-next__title">{t("overlay.series.opponentChoosing", { name: opponentName })}</p>
        {countdown}
      </div>
    );
  }
  return (
    <div className="series-next">
      <p className="series-next__title">{t("overlay.series.youChoose", { game: nextGame })}</p>
      <div className="game-actions-row">
        <Button full autoFocus icon={Icons.Play} onClick={() => onChooseTurnOrder(true)}>
          {t("overlay.series.goFirst")}
        </Button>
        <Button full variant="secondary" icon={Icons.Clock} onClick={() => onChooseTurnOrder(false)}>
          {t("overlay.series.goSecond")}
        </Button>
      </div>
      {countdown}
    </div>
  );
}

type GetStartingTitleParams = {
  series: SeriesView;
  nextGame: number;
  opponentName: string;
  t: ReturnType<typeof useTranslation>["t"];
};

function getStartingTitle({ series, nextGame, opponentName, t }: GetStartingTitleParams): string {
  if (series.viewerGoesFirst === undefined) {
    return t("overlay.series.startingDrawn", { game: nextGame });
  }
  if (series.viewerGoesFirst) {
    return t("overlay.series.startingYou", { game: nextGame });
  }
  return t("overlay.series.startingOpponent", { game: nextGame, name: opponentName });
}
