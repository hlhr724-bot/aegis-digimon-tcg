import type { GameState } from "@aegis/shared/schema/GameState";
import { useTranslation } from "@/i18n/useTranslation";

export function RankedRoundTimer({ state }: { state: GameState }) {
  const { t } = useTranslation();
  if (!state.rankedDeadlineAt) {
    return null;
  }
  const seconds = Math.max(0, Math.ceil(state.rankedRemainingSeconds));
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  let label = t("ranked.season.round");
  if (state.rankedOvertimeTurn >= 0) {
    label = t("ranked.season.overtime", { turn: Math.min(3, Math.max(0, state.turnCount - state.rankedOvertimeTurn)) });
  }
  return (
    <span className="ranked-round-clock" role="timer" aria-label={`${label}: ${text}`}>
      {label} · {text}
    </span>
  );
}
