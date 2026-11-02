import { RankedRoundTimer } from "@/ranked/RankedRoundTimer";
import { MatchInactivity } from "@aegis/shared/MatchInactivity";
import { createPortal } from "react-dom";
import type { GameState, Seat } from "@aegis/shared";
import { useTranslation } from "../i18n";
import { RematchStatus } from "@aegis/shared/protocol/RematchStatus";
import "./matchTimer.css";

export function formatMatchTime(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

/** Reads live authoritative state, never the board's held animation snapshot. */
export function MatchTimer({ state, seat, opponent = false }: { state: GameState; seat: Seat; opponent?: boolean }) {
  const { t } = useTranslation();
  if (!state.matchTimer) return null;
  const mulligan = state.pendingDecision?.kind === "mulligan" && state.pendingDecision.seat === seat;
  const bank = mulligan
    ? seat === 0
      ? state.mulliganTimerRemaining0
      : state.mulliganTimerRemaining1
    : seat === 0
      ? state.timerRemaining0
      : state.timerRemaining1;
  const remaining = Math.max(0, Math.ceil(bank));
  const active = !state.gameOver && state.timerActiveSeat === seat;
  const low = remaining <= (mulligan ? 10 : 30);
  const hasDecisionBudget = !state.gameOver && !mulligan && state.inactivitySeat === seat;
  const inactivity = active && hasDecisionBudget && state.inactivityRemainingSeconds <= MatchInactivity.warningSeconds;
  const decisionInfo = hasDecisionBudget
    ? t("game.timer.decisionAndMatch", { decision: state.inactivityRemainingSeconds, match: remaining })
    : "";
  const warning = inactivity ? t("game.timer.inactivityWarning", { seconds: state.inactivityRemainingSeconds }) : "";
  const owner = t(opponent ? "game.timer.opponent" : "game.timer.you");
  const label = mulligan ? `${owner} (${t("game.timer.mulligan")})` : owner;
  return (
    <div
      className="match-timer"
      data-clock={mulligan ? "mulligan" : "match"}
      data-active={active || undefined}
      data-low={low || inactivity || undefined}
      title={warning || decisionInfo || undefined}
      data-decision-budget={hasDecisionBudget || undefined}
      data-side={opponent ? "opponent" : "player"}
      data-testid={opponent ? "opponent-match-timer" : "viewer-match-timer"}
      role="timer"
      aria-label={`${label}: ${formatMatchTime(remaining)}. ${t(active ? "game.playing" : "game.timer.paused")}${decisionInfo ? `. ${decisionInfo}` : ""}${warning ? ` ${warning}` : ""}`}
    >
      {mulligan ? (
        <span className="match-timer__budget" data-budget="mulligan" data-low={low || undefined} aria-hidden="true">
          <span className="match-timer__caption">{t("game.timer.mulligan")}</span>
          <strong className="match-timer__value">{remaining}</strong>
        </span>
      ) : (
        <>
          {hasDecisionBudget ? (
            <span
              className="match-timer__budget"
              data-budget="decision"
              data-low={inactivity || undefined}
              aria-hidden="true"
            >
              <span className="match-timer__caption">
                {t(inactivity ? "game.timer.inactivity" : "game.timer.decisionLabel")}
              </span>
              <strong className="match-timer__value">{state.inactivityRemainingSeconds}</strong>
            </span>
          ) : null}
          <span className="match-timer__budget" data-budget="match" data-low={low || undefined} aria-hidden="true">
            <span className="match-timer__caption">{t("game.timer.matchLabel")}</span>
            <strong className="match-timer__value">{remaining}</strong>
          </span>
        </>
      )}
      {!opponent ? <RankedRoundTimer state={state} /> : null}
    </div>
  );
}

/** The series score beside the clock, from the viewer's side; nothing in a single game. */
export function SeriesBadge({ state, viewerSeat }: { state: GameState; viewerSeat: Seat }) {
  const { t } = useTranslation();
  const series = state.series;
  if (!series || series.bestOf <= 1 || series.rematchStatus === RematchStatus.ACCEPTED.value) {
    return null;
  }
  const you = viewerSeat === 0 ? series.wins0 : series.wins1;
  const opponent = viewerSeat === 0 ? series.wins1 : series.wins0;
  const values = { game: series.gameNumber, bestOf: series.bestOf, you, opponent };
  return (
    <span className="series-badge" role="status" aria-label={t("game.series.badgeLabel", values)}>
      <span className="series-badge__game" aria-hidden="true">
        {t("game.series.badgeGame", values)}
      </span>
      <span aria-hidden="true">{t("game.series.badgeScore", values)}</span>
    </span>
  );
}

export function viewerDecisionTimed(state: GameState, seat: Seat): boolean {
  return state.matchTimer && !state.gameOver && state.pendingDecision?.seat === seat;
}

/**
 * Keep both clocks visible while the viewer's decision sheet covers the player
 * identities. The opponent's decision opens no sheet, so the header clocks stay.
 */
export function DecisionMatchTimer({ state, seat }: { state: GameState; seat: Seat }) {
  if (!viewerDecisionTimed(state, seat) || typeof document === "undefined") return null;
  return createPortal(
    <div className="game-decision-clocks">
      <MatchTimer state={state} seat={(1 - seat) as Seat} opponent />
      <MatchTimer state={state} seat={seat} />
    </div>,
    document.body,
  );
}
