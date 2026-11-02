import { ROOM_TYPE_MANUAL_PRIVATE } from "@aegis/shared/protocol/messages";
import type { Express } from "express";
import { ErrorCode, ServerError, matchMaker } from "colyseus";
import { ROOM_TYPE_PRIVATE } from "@aegis/shared";
import { roomCodeDirectory, type AegisRoom } from "./AegisRoom.js";

/**
 * POST /room/lookup  { roomCode: string }
 * Resolves a private room code to its Colyseus room ID so the client can
 * joinById. Returns 404 if the code is unknown or the room is full/gone.
 */
export function installPrivateRoomRoutes(app: Express): void {
  app.post("/room/lookup", async (req, res) => {
    const { roomCode } = req.body as { roomCode?: string };
    if (!roomCode) {
      res.status(400).json({ error: "roomCode required" });
      return;
    }
    const code = roomCode.toUpperCase();
    const roomId = await roomCodeDirectory().resolve(code);
    if (!roomId) {
      res.status(404).json({ error: "room not found" });
      return;
    }
    // Asked of the matchmaker rather than this process's registry: in a cluster the room is
    // usually somewhere else, and the driver is the only place that knows its seat count.
    const [listing] = await matchMaker.query({ roomId });
    if (listing === undefined) {
      roomCodeDirectory().release(code, roomId);
      res.status(404).json({ error: "room not available" });
      return;
    }
    // A failed player join must not revoke a running match's spectator code.
    if (
      (listing.name !== ROOM_TYPE_PRIVATE && listing.name !== ROOM_TYPE_MANUAL_PRIVATE) ||
      listing.clients >= 2 ||
      listing.locked
    ) {
      res.status(404).json({ error: "room not available" });
      return;
    }
    try {
      const rules = await matchMaker.remoteRoomCall<AegisRoom, "privateRoomInfo">(roomId, "privateRoomInfo", []);
      const { hostAccountId: _hostAccountId, waiting: _waiting, ...publicRules } = rules;
      res.json({ roomId, ...publicRules });
    } catch (error) {
      // Colyseus uses the same RPC timeout for a disposed room and a failed remote
      // call. Only an absent listing confirms expiry; a still-listed room or any
      // unexpected failure must continue through Express's server-error handler.
      if (
        error instanceof ServerError &&
        error.code === ErrorCode.MATCHMAKE_UNHANDLED &&
        error.message.startsWith(`remote room (${roomId}) timed out, requesting "privateRoomInfo with args []". (`)
      ) {
        const [currentListing] = await matchMaker.query({ roomId });
        if (currentListing === undefined) {
          roomCodeDirectory().release(code, roomId);
          res.status(404).json({ error: "room not available" });
          return;
        }
      }
      throw error;
    }
  });
}
