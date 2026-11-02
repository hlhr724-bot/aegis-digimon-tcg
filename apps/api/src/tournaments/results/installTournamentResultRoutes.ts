import type { Express, NextFunction, Request, Response } from "express";
import type { AccountStore, AuthSession } from "#api/accounts/AccountStore";
import { isUuid } from "#api/community/CommunityDeckStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";
import { TournamentResultStore } from "#api/tournaments/results/TournamentResultStore";

type Params = {
  app: Express;
  accounts: AccountStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

export function installTournamentResultRoutes({ app, accounts, session }: Params): void {
  const allow = tokenBucketLimiter({ capacity: 60, refillMs: 500 });
  const store = new TournamentResultStore(accounts);
  function handle(action: (req: Request, res: Response) => Promise<void>) {
    return (req: Request, res: Response, next: NextFunction): void => {
      res.set("Cache-Control", "private, no-store");
      if (!allow(req.ip ?? "unknown")) {
        res.status(429).set("Retry-After", "2").json({ error: "tournament_results_rate_limited" });
        return;
      }
      action(req, res).catch(next);
    };
  }

  app.get(
    "/tournaments/:id/export",
    handle(async (req, res) => {
      const auth = await session(req);
      if (!auth) {
        res.status(401).json({ error: "authentication_required" });
        return;
      }
      const tournamentId = String(req.params.id ?? "");
      const found = isUuid(tournamentId) ? await store.findExport(tournamentId) : { kind: "not_found" as const };
      if (found.kind === "not_found") {
        res.status(404).json({ error: "tournament_not_found" });
        return;
      }
      if (found.organizerId !== auth.account.id && !auth.account.isAdmin) {
        res.status(403).json({ error: "tournament_export_forbidden" });
        return;
      }
      if (!found.payload) {
        res.status(404).json({ error: "tournament_export_not_ready" });
        return;
      }
      res.json(found.payload);
    }),
  );
}
