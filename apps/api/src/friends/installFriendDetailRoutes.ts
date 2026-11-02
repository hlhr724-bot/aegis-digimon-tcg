import type { Express, Request } from "express";
import type { AccountStore, AuthSession } from "#api/accounts/AccountStore";
import type { ReplayLibrary } from "#api/replays/ReplayLibrary";
import { FriendStore } from "#api/friends/FriendStore";
import { socialRuntime } from "#api/social/socialRuntime";
import type { FriendDetail } from "@aegis/shared/friends/FriendDetail";

type InstallFriendDetailRoutesParams = {
  app: Express;
  accounts: AccountStore;
  replays: ReplayLibrary;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

export function installFriendDetailRoutes({ app, accounts, replays, session }: InstallFriendDetailRoutesParams): void {
  app.get("/friends/:accountId/detail", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const auth = await session(req);
    if (!auth) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }
    const friendId = String(req.params.accountId);
    const friend = (await new FriendStore(accounts).list(auth.account.id)).find(
      (entry) => entry.accountId === friendId,
    );
    if (!friend) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const service = socialRuntime.service;
    const presence = service
      ? await service.visiblePresence({ viewerId: auth.account.id, presence: await service.readPresence(friendId) })
      : { accountId: friendId, status: null };
    const preferences = await accounts.preferences(friendId);
    const result: FriendDetail = {
      friend: { ...friend, ...presence },
      replays: await replays.listForFriend({ accountId: auth.account.id, friendId }),
      stats: preferences.shareProfileStats === true ? await accounts.matchSummary(friendId) : null,
    };
    res.json(result);
  });
  app.get("/friends/:accountId/replays", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const auth = await session(req);
    if (!auth) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }
    const friendId = String(req.params.accountId);
    if (!(await new FriendStore(accounts).list(auth.account.id)).some((friend) => friend.accountId === friendId)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ replays: await replays.listForFriend({ accountId: auth.account.id, friendId }) });
  });
}
