import type { Express, Request } from "express";
import type { AuthSession } from "#api/accounts/AccountStore";
import type { BlockStore } from "#api/blocks/BlockStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";

type InstallBlockRoutesParams = {
  app: Express;
  store: BlockStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
  resolveOpponent?: (roomId: string, accountId: string) => Promise<string | undefined>;
};

export function installBlockRoutes({ app, store, session, resolveOpponent }: InstallBlockRoutesParams): void {
  const limit = tokenBucketLimiter({ capacity: 30, refillMs: 60_000 });
  app.use("/account/blocks", async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const auth = await session(req);
    if (!auth) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }
    res.locals.blockAccountId = auth.account.id;
    next();
  });
  app.get("/account/blocks", async (_req, res) => {
    res.json({ blocks: await store.list(res.locals.blockAccountId) });
  });
  app.post("/account/blocks/opponent", async (req, res) => {
    const accountId = res.locals.blockAccountId as string;
    if (!limit(accountId)) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    const roomId = req.body?.roomId;
    if (typeof roomId !== "string" || !roomId || roomId.length > 128) {
      res.status(400).json({ error: "invalid_target" });
      return;
    }
    const otherId = await resolveOpponent?.(roomId, accountId);
    if (!otherId) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const result = await store.block({ accountId, otherId });
    res.status("error" in result ? 409 : 200).json(result);
  });
  app.put("/account/blocks/:accountId", async (req, res) => {
    const otherId = req.params.accountId;
    if (
      typeof otherId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(otherId)
    ) {
      res.status(400).json({ error: "invalid_target" });
      return;
    }
    if (!limit(res.locals.blockAccountId)) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    const result = await store.block({ accountId: res.locals.blockAccountId, otherId });
    res.status("error" in result ? 409 : 200).json(result);
  });
  app.delete("/account/blocks/:accountId", async (req, res) => {
    const otherId = req.params.accountId;
    if (
      typeof otherId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(otherId)
    ) {
      res.status(400).json({ error: "invalid_target" });
      return;
    }
    await store.unblock({ accountId: res.locals.blockAccountId, otherId });
    res.json({ ok: true });
  });
}
