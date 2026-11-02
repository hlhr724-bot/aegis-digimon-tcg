import type { Phase, Seat } from "@aegis/shared/schema/enums";
import type { LogEntry, LogTurnGroup } from "@/game/log/LogEntry";

type Params = { entries: readonly LogEntry[] };
type MutableTurn = {
  turnCount: number;
  turnSeat: Seat;
  phases: { phase: Phase; entries: LogEntry[] }[];
};

export function groupLogEntries({ entries }: Params): LogTurnGroup[] {
  const turns: MutableTurn[] = [];
  for (const entry of entries) {
    let turn = turns.at(-1);
    if (!turn || turn.turnCount !== entry.turnCount || turn.turnSeat !== entry.turnSeat) {
      turn = { turnCount: entry.turnCount, turnSeat: entry.turnSeat, phases: [] };
      turns.push(turn);
    }
    let phase = turn.phases.at(-1);
    if (!phase || phase.phase !== entry.phase) {
      phase = { phase: entry.phase, entries: [] };
      turn.phases.push(phase);
    }
    phase.entries.push(entry);
  }
  return turns;
}
