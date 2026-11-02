import type { LogTurnContext } from "@/game/log/LogTurnContext";
import { Phase } from "@aegis/shared/schema/enums";
import type { LogCursor } from "@/game/log/LogCursor";

type Params = { instanceIndex?: ReadonlyMap<string, string>; initialTurn?: LogTurnContext };

export function createLogCursor({ instanceIndex, initialTurn }: Params = {}): LogCursor {
  return {
    entries: [],
    identities: new Map(instanceIndex),
    turnCount: initialTurn?.turnCount ?? 1,
    turnSeat: initialTurn?.turnSeat ?? 0,
    phase: initialTurn?.phase ?? Phase.Active,
    lastSeq: -1,
  };
}
