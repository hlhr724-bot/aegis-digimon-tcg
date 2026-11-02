import type { Express, Request } from "express";
import type { AuthSession, AccountStore } from "#api/accounts/AccountStore";
import { DirectMessageStore } from "#api/messages/DirectMessageStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";

type InstallDirectMessageRoutesParams = {
  app: Express;
  accounts: AccountStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};
export function installDirectMessageRoutes({ app, accounts, session }: InstallDirectMessageRoutesParams): void {
  const store = new DirectMessageStore(accounts);
  const limit = tokenBucketLimiter({ capacity: 5, refillMs: 60_000 });
  app.use("/messages", async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const auth = await session(req);
    if (!auth) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }
    res.locals.messageAccountId = auth.account.id;
    next();
  });
  app.get("/messages/:friendId", async (req, res) => {
    const before = req.query.before === undefined ? undefined : Number(req.query.before);
    if (!isId(req.params.friendId) || (before !== undefined && !Number.isSafeInteger(before))) {
      res.status(400).json({ error: "invalid_target" });
      return;
    }
    const messages = await store.list({
      accountId: res.locals.messageAccountId,
      friendId: req.params.friendId,
      before,
    });
    if (!messages) {
      res.status(404).json({ error: "unavailable" });
      return;
    }
    res.json({ messages });
  });
  app.post("/messages/:messageId/report", async (req, res) => {
    const accountId = res.locals.messageAccountId as string;
    if (!limit(accountId)) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    if (!isId(req.params.messageId)) {
      res.status(400).json({ error: "invalid_target" });
      return;
    }
    const id = await store.report({ accountId, messageId: req.params.messageId });
    res.status(id ? 201 : 404).json(id ? { number: id } : { error: "unavailable" });
  });
}
function isId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
