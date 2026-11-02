import { matchMaker } from "colyseus";
import type { Express, Request } from "express";
import type { AccountStore, AuthSession } from "#api/accounts/AccountStore";
import { socialRuntime } from "#api/social/socialRuntime";
import { roomCodeDirectory } from "#api/rooms/AegisRoom";
import type { AegisRoom } from "#api/rooms/AegisRoom";
import { tokenBucketLimiter } from "#api/http/rateLimit";

type InstallFriendSpectatorRoutesParams = {
  app: Express;
  accounts: AccountStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

export function installFriendSpectatorRoutes({ app, accounts, session }: InstallFriendSpectatorRoutesParams): void {
  const limit = tokenBucketLimiter({ capacity: 10, refillMs: 3000 });
  app.post("/spectate/friend", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const auth = await session(req);
    if (!auth) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }
    if (!limit(auth.account.id)) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    const accountId = req.body?.accountId;
    const service = socialRuntime.service;
    if (
      typeof accountId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(accountId) ||
      !service ||
      !(await service.canInteract(auth.account.id, accountId))
    ) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const live = await service.readPresence(accountId);
    const roomId = live.roomCode ? await roomCodeDirectory().resolve(live.roomCode) : undefined;
    const [listing] = roomId ? await matchMaker.query({ roomId }) : [];
    if (
      !listing ||
      !live.roomCode ||
      !(await matchMaker.remoteRoomCall<AegisRoom, "canSpectateAccount">(listing.roomId, "canSpectateAccount", [
        auth.account.id,
        live.roomCode,
      ]))
    ) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const ticket = await accounts.createRoomTicket(auth.account.id);
    res.json(
      await matchMaker.reserveSeatFor(listing, {
        spectator: true,
        roomCode: live.roomCode,
        authTicket: ticket,
        displayName: auth.account.displayName,
        deck: { mainDeck: [], eggDeck: [] },
      }),
    );
  });
}
