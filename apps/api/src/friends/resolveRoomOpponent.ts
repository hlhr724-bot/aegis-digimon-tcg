import { matchMaker } from "colyseus";
import type { AegisRoom } from "#api/rooms/AegisRoom";

type ResolveRoomOpponentParams = { roomId: string; accountId: string };

export async function resolveRoomOpponent({
  roomId,
  accountId,
}: ResolveRoomOpponentParams): Promise<string | undefined> {
  const [listing] = await matchMaker.query({ roomId });
  if (!listing) {
    return undefined;
  }
  return matchMaker.remoteRoomCall<AegisRoom, "getOpponentAccountId">(roomId, "getOpponentAccountId", [accountId]);
}
