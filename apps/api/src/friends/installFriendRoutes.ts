import type { Express, Request } from "express";
import type { AuthSession } from "#api/accounts/AccountStore";
import type { FriendStore } from "#api/friends/FriendStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";

type InstallFriendRoutesParams = {
  app: Express;
  store: FriendStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

export function installFriendRoutes({ app, store, session }: InstallFriendRoutesParams): void {
  const limit = tokenBucketLimiter({ capacity: 20, refillMs: 60_000 });
  app.use("/friends", async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const auth = await session(req);
    if (!auth) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }
    res.locals.friendAccountId = auth.account.id;
    next();
  });
  app.get("/friends", async (_req, res) => {
    res.json({ friends: await store.list(res.locals.friendAccountId) });
  });
  app.get("/friends/requests", async (_req, res) => {
    res.json({ requests: await store.listRequests(res.locals.friendAccountId) });
  });
  app.post("/friends/requests", async (req, res) => {
    const accountId = res.locals.friendAccountId as string;
    if (!limit(accountId)) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    const body = req.body as Record<string, unknown> | undefined;
    const displayName = body?.displayName;
    const matchId = body?.matchId;
    if (
      (typeof displayName === "string") === (typeof matchId === "string") ||
      (displayName !== undefined &&
        (typeof displayName !== "string" || !displayName.trim() || displayName.length > 32)) ||
      (matchId !== undefined && (typeof matchId !== "string" || !matchId || matchId.length > 128))
    ) {
      res.status(400).json({ error: "invalid_target" });
      return;
    }
    const result = await store.request({
      accountId,
      displayName: typeof displayName === "string" ? displayName.trim() : undefined,
      matchId: typeof matchId === "string" ? matchId : undefined,
    });
    res.status("error" in result ? 409 : 200).json(result);
  });
  app.post("/friends/requests/:accountId/accept", async (req, res) => {
    if (!isAccountId(req.params.accountId)) {
      res.status(400).json({ error: "invalid_target" });
      return;
    }
    const result = await store.accept({ accountId: res.locals.friendAccountId, otherId: req.params.accountId });
    res.status("error" in result ? 409 : 200).json(result);
  });
  app.post("/friends/requests/:accountId/decline", async (req, res) => {
    if (!isAccountId(req.params.accountId)) {
      res.status(400).json({ error: "invalid_target" });
      return;
    }
    await store.decline({ accountId: res.locals.friendAccountId, otherId: req.params.accountId });
    res.json({ ok: true });
  });
  app.delete("/friends/requests/:accountId", async (req, res) => {
    if (!isAccountId(req.params.accountId)) {
      res.status(400).json({ error: "invalid_target" });
      return;
    }
    await store.cancel({ accountId: res.locals.friendAccountId, otherId: req.params.accountId });
    res.json({ ok: true });
  });
  app.delete("/friends/:accountId", async (req, res) => {
    if (!isAccountId(req.params.accountId)) {
      res.status(400).json({ error: "invalid_target" });
      return;
    }
    await store.remove({ accountId: res.locals.friendAccountId, otherId: req.params.accountId });
    res.json({ ok: true });
  });
}

function isAccountId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
