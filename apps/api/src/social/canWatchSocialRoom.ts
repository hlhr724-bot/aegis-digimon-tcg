import { matchMaker } from "colyseus";
import { roomCodeDirectory } from "#api/rooms/AegisRoom";
import type { AegisRoom } from "#api/rooms/AegisRoom";

type CanWatchSocialRoomParams = { code: string; viewerId: string };

export async function canWatchSocialRoom({ code, viewerId }: CanWatchSocialRoomParams): Promise<boolean> {
  const roomId = await roomCodeDirectory().resolve(code);
  if (!roomId || !(await matchMaker.query({ roomId })).length) {
    return false;
  }
  return matchMaker.remoteRoomCall<AegisRoom, "canSpectateAccount">(roomId, "canSpectateAccount", [viewerId, code]);
}
