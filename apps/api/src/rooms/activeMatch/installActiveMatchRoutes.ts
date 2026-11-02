import { matchMaker } from "colyseus";
import type { Express, Request, Response } from "express";
import type { ActiveMatch } from "@aegis/shared/protocol/ActiveMatch";
import type { ActiveMatchClaim } from "@aegis/shared/protocol/ActiveMatchClaim";
import type { AuthSession } from "#api/accounts/AccountStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";
import type { AegisRoom } from "#api/rooms/AegisRoom";
import type { ActiveMatchDirectory } from "#api/rooms/activeMatch/ActiveMatchDirectory";
import type { ActiveMatchRooms } from "#api/rooms/activeMatch/ActiveMatchRooms";
import { activeMatchRuntime } from "#api/rooms/activeMatch/activeMatchRuntime";

type InstallActiveMatchRoutesParams = {
  app: Express;
  session: (req: Request) => Promise<AuthSession | undefined>;
  directory?: () => ActiveMatchDirectory;
  rooms?: ActiveMatchRooms;
};

type ResolveAccountParams = {
  req: Request;
  res: Response;
  session: (req: Request) => Promise<AuthSession | undefined>;
  limit: (key: string) => boolean;
};

const remoteRooms: ActiveMatchRooms = {
  findSeat: async ({ roomId, accountId }) => {
    const [listing] = await matchMaker.query({ roomId });
    if (!listing) {
      return null;
    }
    return matchMaker.remoteRoomCall<AegisRoom, "findAccountSeat">(roomId, "findAccountSeat", [accountId]);
  },
  transferSeat: async ({ roomId, accountId }) => {
    const [listing] = await matchMaker.query({ roomId });
    if (!listing) {
      return null;
    }
    return matchMaker.remoteRoomCall<AegisRoom, "transferAccountSeat">(roomId, "transferAccountSeat", [accountId]);
  },
};

async function resolveAccountId({ req, res, session, limit }: ResolveAccountParams): Promise<string | undefined> {
  res.set("Cache-Control", "no-store");
  const auth = await session(req);
  if (!auth) {
    res.status(401).json({ error: "authentication_required" });
    return undefined;
  }
  if (!limit(auth.account.id)) {
    res.status(429).json({ error: "too_many_requests" });
    return undefined;
  }
  return auth.account.id;
}

export function installActiveMatchRoutes({
  app,
  session,
  directory = () => activeMatchRuntime.directory,
  rooms = remoteRooms,
}: InstallActiveMatchRoutesParams): void {
  const limit = tokenBucketLimiter({ capacity: 10, refillMs: 3000 });

  app.get("/match/active", async (req, res) => {
    const accountId = await resolveAccountId({ req, res, session, limit });
    if (!accountId) {
      return;
    }
    const roomId = await directory().find(accountId);
    const match = roomId ? await rooms.findSeat({ roomId, accountId }).catch(() => null) : null;
    if (!match) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(match satisfies ActiveMatch);
  });

  app.post("/match/active/claim", async (req, res) => {
    if (!req.is("application/json")) {
      res.status(415).json({ error: "unsupported_media_type" });
      return;
    }
    const accountId = await resolveAccountId({ req, res, session, limit });
    if (!accountId) {
      return;
    }
    const requestedRoomId: unknown = req.body?.roomId;
    const roomId = await directory().find(accountId);
    if (typeof requestedRoomId !== "string" || !roomId || requestedRoomId !== roomId) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const claim = await rooms.transferSeat({ roomId, accountId }).catch(() => null);
    if (!claim) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(claim satisfies ActiveMatchClaim);
  });
}
