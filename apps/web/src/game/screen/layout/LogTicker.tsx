import { MemoryBadge } from "@/game/log/MemoryBadge";
/* The slim ticker at the board's right edge: whose turn it is, the turn and memory
   readout, and the running match log. Desktop replaced the sidebar with it and keeps
   it unobtrusive — the header's log button opens the full history sheet. */

import { useTranslation } from "../../../i18n";
import type { Seat } from "@aegis/shared";
import type { LogLine } from "@/game/log/LogEntry";

export function LogTicker({
  log,
  viewerSeat,
  displayedTurnSeat,
  displayedTurnCount,
  memory,
}: {
  log: readonly LogLine[];
  viewerSeat: Seat;
  displayedTurnSeat: Seat;
  displayedTurnCount: number;
  memory: number;
}) {
  const { t } = useTranslation();
  return (
    <aside className="game-log-ticker" aria-label={t("game.matchLog")}>
      <div className="game-log-ticker__status">
        <span data-my-turn={displayedTurnSeat === viewerSeat || undefined}>
          {displayedTurnSeat === viewerSeat ? t("game.yourTurn") : t("game.opponentsTurn")}
        </span>
        <span>
          {t("game.turnAndMemory", { turn: displayedTurnCount, memory: `${memory > 0 ? "+" : ""}${memory}` })}
        </span>
      </div>
      <ol className="game-log-ticker__lines">
        {log.map((e, i) => (
          <li key={i} data-kind={e.kind}>
            {e.text}
            {e.memory ? <MemoryBadge memory={e.memory} /> : null}
          </li>
        ))}
      </ol>
    </aside>
  );
}
