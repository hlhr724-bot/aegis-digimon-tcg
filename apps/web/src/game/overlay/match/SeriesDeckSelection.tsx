import type { CSSProperties } from "react";
import { SERIES_DECK_SELECTION_SECONDS } from "@aegis/shared/matchFormat";
import { Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import { formatMatchTime } from "@/game/MatchTimer";
import type { SeriesView } from "@/game/seriesModel";
import "@/game/overlay/match/seriesStatus.css";

export interface SeriesDeckSelectionProps {
  series: SeriesView;
  opponentName: string;
  onKeepDeck: () => void;
  onChangeDeck?: () => void;
}

export function SeriesDeckSelection({ series, opponentName, onKeepDeck, onChangeDeck }: SeriesDeckSelectionProps) {
  const { t } = useTranslation();
  return (
    <div className="series-next" role="status">
      <p className="series-next__title">{t("overlay.rematch.deckTitle")}</p>
      {series.viewerDeckReady ? (
        <p className="series-next__detail">{t("overlay.rematch.deckReady")}</p>
      ) : (
        <div className="game-actions-row">
          <Button full autoFocus icon={Icons.Check} onClick={onKeepDeck}>
            {t("overlay.rematch.keepDeck")}
          </Button>
          {onChangeDeck ? (
            <Button full variant="secondary" icon={Icons.LayoutGrid} onClick={onChangeDeck}>
              {t("overlay.rematch.changeDeck")}
            </Button>
          ) : null}
        </div>
      )}
      <p className="series-next__detail">{getOpponentStatus({ series, opponentName, t })}</p>
      <div className="series-next__countdown">
        <span
          className="series-next__bar"
          style={
            {
              "--series-choice-left": series.choiceSecondsLeft,
              "--series-choice-total": SERIES_DECK_SELECTION_SECONDS,
            } as CSSProperties
          }
          aria-hidden="true"
        />
        {series.viewerDeckReady ? null : (
          <span>{t("overlay.rematch.deckAutoKeep", { time: formatMatchTime(series.choiceSecondsLeft) })}</span>
        )}
      </div>
    </div>
  );
}

type GetOpponentStatusParams = {
  series: SeriesView;
  opponentName: string;
  t: ReturnType<typeof useTranslation>["t"];
};

function getOpponentStatus({ series, opponentName, t }: GetOpponentStatusParams): string {
  if (!series.opponentDeckReady) {
    return t("overlay.rematch.opponentPicking", { name: opponentName });
  }
  if (series.opponentDeckChanged) {
    return t("overlay.rematch.opponentChanged", { name: opponentName });
  }
  return t("overlay.rematch.opponentReady", { name: opponentName });
}
