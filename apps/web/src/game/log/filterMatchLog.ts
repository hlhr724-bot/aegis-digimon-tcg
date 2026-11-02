import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { LogTurnGroup } from "@/game/log/LogEntry";

type Params = { turns: readonly LogTurnGroup[]; query: string };

export function filterMatchLog({ turns, query }: Params): readonly LogTurnGroup[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return turns;
  }
  return turns.flatMap((turn) => {
    const phases = turn.phases.flatMap((phase) => {
      const entries = phase.entries.filter((entry) => {
        const searchable = [
          entry.text,
          ...(entry.cardIds ?? []).flatMap((id) => [id, getCardDefinition(id)?.nameEn ?? ""]),
        ];
        return searchable.some((text) => text.toLocaleLowerCase().includes(needle));
      });
      return entries.length ? [{ ...phase, entries }] : [];
    });
    return phases.length ? [{ ...turn, phases }] : [];
  });
}
