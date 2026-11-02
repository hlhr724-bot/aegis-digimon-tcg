import { matchMaker } from "colyseus";
import { ROOM_TYPE_PRIVATE, ROOM_TYPE_MANUAL_PRIVATE } from "@aegis/shared/protocol/messages";
import { roomCodeDirectory } from "#api/rooms/AegisRoom";
import type { AegisRoom } from "#api/rooms/AegisRoom";

export async function resolveSocialInviteRoom(code: string) {
  const roomId = await roomCodeDirectory().resolve(code);
  if (!roomId) {
    return undefined;
  }
  const [listing] = await matchMaker.query({ roomId });
  if (
    !listing ||
    !new Set<string>([ROOM_TYPE_PRIVATE, ROOM_TYPE_MANUAL_PRIVATE]).has(listing.name) ||
    listing.locked ||
    listing.clients >= 2
  ) {
    return undefined;
  }
  return matchMaker.remoteRoomCall<AegisRoom, "privateRoomInfo">(roomId, "privateRoomInfo", []);
}
