import { QuickMatchPolicy } from "#api/rooms/QuickMatchPolicy";
import { ErrorCode, matchMaker, ServerError } from "colyseus";
import { ROOM_TYPE, ROOM_TYPE_BETA, ROOM_TYPE_UNLIMITED } from "@aegis/shared/protocol/messages";
import type { AccountStore } from "#api/accounts/AccountStore";
import { QuickMatchPreference } from "#api/rooms/QuickMatchPreference";
import type { AegisRoom } from "#api/rooms/AegisRoom";

type Params = {
  accounts: Pick<AccountStore, "getRoomTicketAccountId">;
  canCreate: () => boolean;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
};

const quickModes = new Set<string>([ROOM_TYPE, ROOM_TYPE_BETA, ROOM_TYPE_UNLIMITED]);

export function installQuickMatchPreference({
  accounts,
  canCreate,
  now = () => performance.now(),
  wait = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: Params): () => void {
  const original = matchMaker.controller.invokeMethod;
  matchMaker.controller.invokeMethod = async function (method, roomName, options = {}, authOptions) {
    if (method !== "joinOrCreate" || !quickModes.has(roomName)) {
      return original.call(this, method, roomName, options, authOptions);
    }
    const accountId = await accounts.getRoomTicketAccountId(options.authTicket);
    if (!accountId) {
      return original.call(this, method, roomName, options, authOptions);
    }
    const preference = new QuickMatchPreference({ presence: matchMaker.presence });
    const deadline = now() + QuickMatchPolicy.repeatWaitMs;
    const filters = matchMaker.getHandler(roomName).getFilterOptions(options);
    const refusedRooms = new Set<string>();
    for (;;) {
      if (!canCreate()) {
        throw new ServerError(503, "This game server is draining; retry on the active slot.");
      }
      const rooms = await matchMaker.query({ name: roomName, locked: false, private: false, ...filters });
      let recentRoom: (typeof rooms)[number] | undefined;
      for (const room of rooms.slice(0, QuickMatchPolicy.candidateLimit)) {
        if (room.clients >= 2 || refusedRooms.has(room.roomId)) {
          continue;
        }
        let opponentId: string | undefined;
        try {
          opponentId = await matchMaker.remoteRoomCall<AegisRoom, "getQuickMatchAccountId">(
            room.roomId,
            "getQuickMatchAccountId",
            [],
            QuickMatchPolicy.roomLookupTimeoutMs,
          );
        } catch {
          refusedRooms.add(room.roomId);
          continue;
        }
        if (opponentId === accountId) {
          continue;
        }
        if (opponentId && (await preference.isRecentOpponent(accountId, opponentId))) {
          recentRoom ??= room;
          continue;
        }
        try {
          return await matchMaker.joinById(room.roomId, options, authOptions);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            (!(error instanceof ServerError && error.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID) &&
              error.constructor.name !== "SeatReservationError")
          ) {
            throw error;
          }
          refusedRooms.add(room.roomId);
        }
      }
      if (!recentRoom) {
        return original.call(this, method, roomName, options, authOptions);
      }
      if (now() >= deadline) {
        try {
          return await matchMaker.joinById(recentRoom.roomId, options, authOptions);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            (!(error instanceof ServerError && error.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID) &&
              error.constructor.name !== "SeatReservationError")
          ) {
            throw error;
          }
          refusedRooms.add(recentRoom.roomId);
          continue;
        }
      }
      await wait(QuickMatchPolicy.pollIntervalMs);
    }
  };
  return () => {
    matchMaker.controller.invokeMethod = original;
  };
}
