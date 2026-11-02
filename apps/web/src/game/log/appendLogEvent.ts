import { splitLogEvent } from "@/game/log/splitLogEvent";
import { Phase, type Seat } from "@aegis/shared/schema/enums";
import type { SequencedServerEvent, ServerEvent } from "@aegis/shared/protocol/events";
import type { LogCursor } from "@/game/log/LogCursor";
import type { SeatNames } from "@/game/log/SeatNames";
import { rememberEventIdentities } from "@/game/log/rememberEventIdentities";
import { flushPendingLogMemory } from "@/game/log/flushPendingLogMemory";
import { describeEvent } from "@/game/matchLog";
import { LogEffectRole } from "@/game/log/LogEffectRole";
import type { Translate } from "@/i18n/translationTypes";

type Params = {
  cursor: LogCursor;
  event: ServerEvent | SequencedServerEvent;
  viewerSeat: Seat;
  seatNames: SeatNames;
  t: Translate;
};

function resolveEffectRole(kind: ServerEvent["kind"], effectSourceCardId?: string): LogEffectRole | undefined {
  if (kind === "effectActivated" || kind === "effectTriggered") {
    return LogEffectRole.SOURCE.value;
  }
  if (kind === "effectResolved" || kind === "effectHadNoEffect") {
    return LogEffectRole.RESULT.value;
  }
  return effectSourceCardId === undefined ? undefined : LogEffectRole.RESULT.value;
}

export function appendLogEvent({ cursor, event, viewerSeat, seatNames, t }: Params): number {
  const before = cursor.entries.length;
  const seq = "seq" in event ? event.seq : undefined;
  if (seq !== undefined && seq <= cursor.lastSeq) {
    return 0;
  }
  const batch = "batch" in event ? event.batch : undefined;
  if (batch !== cursor.currentBatch) {
    flushPendingLogMemory({ cursor, seatNames, t });
    cursor.currentBatch = batch;
    cursor.currentEffectSourceCardId = undefined;
  }
  if (seq !== undefined) {
    cursor.lastSeq = seq;
  }
  rememberEventIdentities({ identities: cursor.identities, event });
  if (event.kind === "matchStarted") {
    cursor.turnCount = 1;
    cursor.turnSeat = event.firstSeat;
    cursor.phase = Phase.Active;
  }
  if (event.kind === "phaseChanged") {
    flushPendingLogMemory({ cursor, seatNames, t });
    cursor.turnSeat = event.turnSeat;
    cursor.turnCount = event.turnCount + Number(event.phase === Phase.Active);
    if (Object.values(Phase).includes(event.phase as Phase)) {
      cursor.phase = event.phase as Phase;
    }
    return cursor.entries.length - before;
  }
  if (event.kind === "batchClosed") {
    flushPendingLogMemory({ cursor, seatNames, t });
    return cursor.entries.length - before;
  }
  if (event.kind === "memoryChanged") {
    if (event.reason === "passTurn") {
      return cursor.entries.length - before;
    }
    const pending = cursor.pendingMemory;
    if (pending?.from === event.from && pending.to === event.to) {
      return cursor.entries.length - before;
    }
    flushPendingLogMemory({ cursor, seatNames, t });
    cursor.pendingMemory = {
      from: event.from,
      to: event.to,
      seq,
      turnCount: cursor.turnCount,
      turnSeat: cursor.turnSeat,
      phase: cursor.phase,
      sourceCardId: cursor.currentEffectSourceCardId,
    };
    return cursor.entries.length - before;
  }
  for (const describedEvent of splitLogEvent(event)) {
    const line = describeEvent({
      event: describedEvent,
      viewerSeat: viewerSeat,
      identities: cursor.identities,
      seatNames,
      turnSeat: cursor.turnSeat,
      t,
    });
    if (line) {
      const absorbsMemory = event.kind === "cardPlayed" || event.kind === "digivolved" || event.kind === "hatched";
      const pending = absorbsMemory ? cursor.pendingMemory : undefined;
      if (!absorbsMemory) {
        flushPendingLogMemory({ cursor, seatNames, t });
      }
      const actorSeat = line.actorSeat ?? ("seat" in event ? event.seat : undefined);
      let memory;
      if (pending) {
        const sign = actorSeat === pending.turnSeat ? 1 : -1;
        memory = { delta: sign * (pending.to - pending.from), after: sign * pending.to };
        cursor.pendingMemory = undefined;
      }
      if (event.kind === "turnEnded") {
        cursor.turnCount = event.turnCount;
        cursor.turnSeat = event.endingSeat;
        cursor.phase = Phase.End;
      }
      cursor.entries.push({
        ...line,
        id: `log-${cursor.entries.length}`,
        seq,
        turnCount: cursor.turnCount,
        turnSeat: cursor.turnSeat,
        phase: cursor.phase,
        actorSeat,
        memory,
        effectRole: resolveEffectRole(event.kind, cursor.currentEffectSourceCardId),
      });
    }
  }
  if (event.kind === "effectActivated" || event.kind === "effectTriggered" || event.kind === "effectResolved") {
    cursor.currentEffectSourceCardId = event.sourceCardId;
  }
  if (event.kind === "turnEnded") {
    cursor.turnSeat = event.nextSeat;
    cursor.turnCount = event.turnCount + 1;
    cursor.phase = Phase.Active;
    cursor.currentEffectSourceCardId = undefined;
  }
  return cursor.entries.length - before;
}
