import type { LogTurnContext } from "@/game/log/LogTurnContext";
import type { LogEntry, LogTurnGroup } from "@/game/log/LogEntry";
import { useMemo, useRef } from "react";
import type { Seat } from "@aegis/shared/schema/enums";
import type { SequencedServerEvent, ServerEvent } from "@aegis/shared/protocol/events";
import type { ServerBatch } from "@/net/serverBatches";
import type { SeatNames } from "@/game/log/SeatNames";
import type { Translate } from "@/i18n/translationTypes";
import { createLogCursor } from "@/game/log/createLogCursor";
import { appendLogEvent } from "@/game/log/appendLogEvent";
import { flushPendingLogMemory } from "@/game/log/flushPendingLogMemory";
import { groupLogEntries } from "@/game/log/groupLogEntries";
import { flattenRecentLogEntries } from "@/game/log/flattenRecentLogEntries";

type Params = {
  initialTurn?: LogTurnContext;
  events: readonly ServerEvent[];
  batches?: readonly ServerBatch[];
  resetKey: string | number;
  viewerSeat: Seat;
  seatNames: SeatNames;
  instanceIndex: ReadonlyMap<string, string>;
  t: Translate;
};

type HistoryEvent = ServerEvent | SequencedServerEvent;

export function useMatchLogHistory({
  events,
  batches,
  resetKey,
  viewerSeat,
  seatNames,
  instanceIndex,
  initialTurn,
  t,
}: Params) {
  const state = useRef({
    history: [] as HistoryEvent[],
    initialTurn,
    result: undefined as { entries: LogEntry[]; turns: LogTurnGroup[]; recent: LogEntry[] } | undefined,
    cursor: createLogCursor({ instanceIndex, initialTurn }),
    resetKey,
    viewerSeat,
    names: [seatNames[0], seatNames[1]],
    t,
    fabricatedCount: 0,
    lastIncomingSeq: -1,
  });

  return useMemo(() => {
    const retained = state.current;
    const sequenced = events.filter((event): event is SequencedServerEvent => "seq" in event);
    const lastIncomingSeq = sequenced.at(-1)?.seq ?? -1;
    const backwards = lastIncomingSeq >= 0 && lastIncomingSeq < retained.lastIncomingSeq;
    const fabricatedBackwards = sequenced.length === 0 && events.length < retained.fabricatedCount;
    const reset = resetKey !== retained.resetKey || backwards || fabricatedBackwards;
    const relabel =
      retained.viewerSeat !== viewerSeat ||
      retained.names[0] !== seatNames[0] ||
      retained.names[1] !== seatNames[1] ||
      retained.t !== t;
    if (reset) {
      retained.history = [];
      retained.fabricatedCount = 0;
      retained.initialTurn = initialTurn;
      retained.cursor = createLogCursor({ instanceIndex, initialTurn: retained.initialTurn });
    }
    if (retained.history.length === 0) {
      retained.initialTurn = initialTurn;
      retained.cursor = createLogCursor({ instanceIndex, initialTurn });
    }
    let incoming: HistoryEvent[];
    if (sequenced.length) {
      const firstSeq = sequenced[0]!.seq;
      const backfill = firstSeq > retained.cursor.lastSeq + 1 ? (batches ?? []).flatMap((batch) => batch.events) : [];
      const unique = new Map([...backfill, ...sequenced].map((event) => [event.seq, event]));
      incoming = [...unique.values()]
        .filter((event) => event.seq > retained.cursor.lastSeq && event.seq <= lastIncomingSeq)
        .sort((a, b) => a.seq - b.seq);
    } else {
      incoming = events.slice(retained.fabricatedCount);
      retained.fabricatedCount = events.length;
    }
    retained.history.push(...incoming);
    if (relabel) {
      retained.cursor = createLogCursor({ instanceIndex, initialTurn: retained.initialTurn });
      incoming = retained.history;
    }
    for (const [id, cardId] of instanceIndex) {
      if (!retained.cursor.identities.has(id)) {
        retained.cursor.identities.set(id, cardId);
      }
    }
    for (const event of incoming) {
      appendLogEvent({ cursor: retained.cursor, event, viewerSeat, seatNames, t });
    }
    retained.resetKey = resetKey;
    retained.viewerSeat = viewerSeat;
    retained.names = [seatNames[0], seatNames[1]];
    retained.t = t;
    retained.lastIncomingSeq = lastIncomingSeq;
    if (incoming.length === 0 && !reset && !relabel && retained.result) {
      return retained.result;
    }
    const snapshot = { ...retained.cursor, entries: [...retained.cursor.entries] };
    flushPendingLogMemory({ cursor: snapshot, seatNames, t });
    const entries = snapshot.entries;
    retained.result = { entries, turns: groupLogEntries({ entries }), recent: flattenRecentLogEntries({ entries }) };
    return retained.result;
  }, [events, batches, resetKey, viewerSeat, seatNames, instanceIndex, initialTurn, t]);
}
