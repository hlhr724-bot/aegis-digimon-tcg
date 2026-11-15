import { ServerError } from "colyseus";
import type { ConnectionErrorCode } from "@aegis/shared/protocol/ConnectionErrorCode";
import { log } from "#api/logger";

const JOIN_REFUSED_STATUS = 403;

type Params = { roomId: string; reason: ConnectionErrorCode; accountId?: string };

export function refuseJoin({ roomId, reason, accountId }: Params): never {
  log(`[JOIN_REFUSED] ${JSON.stringify({ roomId, reason, accountId })}`);
  throw new ServerError(JOIN_REFUSED_STATUS, reason);
}
