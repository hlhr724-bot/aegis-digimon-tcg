import { matchMaker } from "colyseus";
import type { Express, Request } from "express";
import type { AccountStore, AuthSession } from "#api/accounts/AccountStore";
import { ROOM_TYPE_SOCIAL } from "@aegis/shared/protocol/roomTypeSocial";
import { tokenBucketLimiter } from "#api/http/rateLimit";

type InstallSocialRoutesParams = {
  app: Express;
  accounts: AccountStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

export function installSocialRoutes({ app, accounts, session }: InstallSocialRoutesParams): void {
  let creating: Promise<string> | undefined;
  const limit = tokenBucketLimiter({ capacity: 10, refillMs: 3_000 });
  app.post("/social/join", async (req, res) => {
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
    const [existing] = await matchMaker.query({ name: ROOM_TYPE_SOCIAL, processId: matchMaker.processId });
    if (!existing && !creating) {
      creating = matchMaker
        .handleCreateRoom(ROOM_TYPE_SOCIAL, {})
        .then((room) => room.roomId)
        .finally(() => {
          creating = undefined;
        });
    }
    const roomId = existing?.roomId ?? (await creating!);
    const authTicket = await accounts.createRoomTicket(auth.account.id);
    res.json(await matchMaker.joinById(roomId, { authTicket }));
  });
}
