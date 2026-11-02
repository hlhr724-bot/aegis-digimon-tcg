import type { Express, NextFunction, Request, Response } from "express";
import type { AccountStore, AuthSession } from "#api/accounts/AccountStore";
import { TrophyStore } from "#api/achievements/TrophyStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";

type Params = {
  app: Express;
  accounts: AccountStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

export function installAchievementRoutes({ app, accounts, session }: Params): void {
  const allow = tokenBucketLimiter({ capacity: 30, refillMs: 1_000 });
  const trophies = new TrophyStore(accounts);
  app.get("/achievements/trophies", async (req: Request, res: Response, next: NextFunction) => {
    res.set("Cache-Control", "private, no-store");
    if (!allow(req.ip ?? "unknown")) {
      res.status(429).set("Retry-After", "2").json({ error: "achievements_rate_limited" });
      return;
    }
    try {
      const auth = await session(req);
      if (!auth) {
        res.status(401).json({ error: "authentication_required" });
        return;
      }
      res.json(await trophies.getTrophies(auth.account.id));
    } catch (error) {
      next(error);
    }
  });
}
