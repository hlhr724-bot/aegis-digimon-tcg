import type { Seat, SeriesEndReason, SeriesPhase, SeriesState } from "@aegis/shared";
import type { GameOverOutcome } from "./gameOverSplash";

export type SeriesPip = "win" | "loss" | "draw" | "pending";

/** A best-of-three as one seat sees it: every count and pip is from the viewer's side. */
export interface SeriesView {
  bestOf: number;
  gameNumber: number;
  viewerWins: number;
  opponentWins: number;
  /** One per game: the played ones in order, then the games still to come. */
  pips: SeriesPip[];
  stage: SeriesPhase;
  viewerChooses: boolean;
  choiceSecondsLeft: number;
  /** Known once the turn order for the next game is set. */
  viewerGoesFirst: boolean | undefined;
  viewerDeckReady: boolean;
  opponentDeckReady: boolean;
  opponentDeckChanged: boolean;
  outcome: GameOverOutcome | undefined;
  endReason: SeriesEndReason;
}

/** `undefined` for a single-game room, which shows nothing about series at all. */
export function seriesView(series: SeriesState | undefined, viewerSeat: Seat): SeriesView | undefined {
  if (!series || series.bestOf <= 1) return undefined;
  const opponentSeat = (1 - viewerSeat) as Seat;
  const results = [...series.results];
  const played: SeriesPip[] = results.map((winner) =>
    winner === -1 ? "draw" : winner === viewerSeat ? "win" : "loss",
  );
  const over = series.phase === "over";
  // Draws can push a running series past `bestOf` games; it still has one game to come.
  const pending = over ? 0 : Math.max(1, series.bestOf - played.length);
  const pips = [...played, ...Array.from({ length: pending }, () => "pending" as const)];
  return {
    bestOf: series.bestOf,
    gameNumber: series.gameNumber,
    viewerWins: viewerSeat === 0 ? series.wins0 : series.wins1,
    opponentWins: opponentSeat === 0 ? series.wins0 : series.wins1,
    pips,
    stage: series.phase,
    viewerChooses: series.phase === "choosing" && series.chooserSeat === viewerSeat,
    choiceSecondsLeft: series.choiceSecondsLeft,
    viewerGoesFirst: series.nextFirstSeat === -1 ? undefined : series.nextFirstSeat === viewerSeat,
    viewerDeckReady: viewerSeat === 0 ? series.deckReady0 : series.deckReady1,
    opponentDeckReady: opponentSeat === 0 ? series.deckReady0 : series.deckReady1,
    opponentDeckChanged: opponentSeat === 0 ? series.deckChanged0 : series.deckChanged1,
    outcome: !over ? undefined : series.winnerSeat === -1 ? "draw" : series.winnerSeat === viewerSeat ? "win" : "loss",
    endReason: series.endReason,
  };
}
