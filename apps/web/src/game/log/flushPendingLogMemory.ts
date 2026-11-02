import { getLogCardName } from "@/game/log/getLogCardName";
import type { LogCursor } from "@/game/log/LogCursor";
import type { SeatNames } from "@/game/log/SeatNames";
import type { Translate } from "@/i18n/translationTypes";

type Params = { cursor: LogCursor; seatNames: SeatNames; t: Translate };

export function flushPendingLogMemory({ cursor, seatNames, t }: Params): void {
  const pending = cursor.pendingMemory;
  if (!pending) {
    return;
  }
  const { sourceCardId, from, to, turnCount, turnSeat, phase, seq } = pending;
  const text = sourceCardId
    ? t("log.memoryChangedBy", { card: getLogCardName({ cardId: sourceCardId }), from, to })
    : t("log.memoryOfPlayer", { player: seatNames[turnSeat], from, to });
  cursor.entries.push({
    id: `log-${cursor.entries.length}`,
    seq,
    turnCount,
    turnSeat,
    phase,
    text,
    kind: "sys",
    cardIds: sourceCardId ? [sourceCardId] : undefined,
  });
  cursor.pendingMemory = undefined;
}
