import type { Express, NextFunction, Request, Response } from "express";
import type { AccountStore, AuthSession } from "#api/accounts/AccountStore";
import { isUuid } from "#api/community/CommunityDeckStore";
import { parseId } from "#api/http/parseId";
import { tokenBucketLimiter } from "#api/http/rateLimit";
import { parseTournamentReportInput } from "#api/tournaments/reports/parseTournamentReportInput";
import type { TournamentReportStore } from "#api/tournaments/reports/TournamentReportStore";
import { isTournamentReportAction } from "@aegis/shared/tournaments/isTournamentReportAction";
import { TournamentReportAction } from "@aegis/shared/tournaments/TournamentReportAction";

type TournamentReportRouteDeps = {
  app: Express;
  accounts: AccountStore;
  store: TournamentReportStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

type Access = "signedIn" | "admin";
type Handler = (req: Request, res: Response, auth: AuthSession) => Promise<void>;

export function installTournamentReportRoutes({ app, accounts, store, session }: TournamentReportRouteDeps): void {
  const limitReport = tokenBucketLimiter({ capacity: 5, refillMs: 60_000 });
  const route =
    (access: Access, handler: Handler) =>
    (req: Request, res: Response, next: NextFunction): void => {
      res.set("Cache-Control", "no-store");
      void (async () => {
        const auth = await session(req);
        if (!auth) {
          res.status(401).json({ error: "authentication_required" });
          return;
        }
        if (access === "admin" && !auth.account.isAdmin) {
          res.status(403).json({ error: "admin_required" });
          return;
        }
        await handler(req, res, auth);
      })().catch(next);
    };

  app.post(
    "/tournaments/:id/reports",
    route("signedIn", async (req, res, auth) => {
      const input = parseTournamentReportInput(req.body);
      if (!input) {
        res.status(400).json({ error: "invalid_report" });
        return;
      }
      if (!limitReport(auth.account.id)) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      const tournamentId = String(req.params.id);
      const tournament = isUuid(tournamentId) ? await store.findReportTarget(tournamentId) : undefined;
      if (!tournament) {
        res.status(404).json({ error: "tournament_not_found" });
        return;
      }
      if (tournament.createdBy === auth.account.id) {
        res.status(403).json({ error: "own_tournament" });
        return;
      }
      await store.recordReport({ reporterAccountId: auth.account.id, tournament, input });
      res.status(201).json({ reported: true });
    }),
  );

  app.get(
    "/account/admin/tournament-reports",
    route("admin", async (_req, res) => {
      res.json({ reports: await store.listOpenReports() });
    }),
  );

  app.post(
    "/account/admin/tournament-reports/:id/resolve",
    route("admin", async (req, res, auth) => {
      const reportId = parseId(req.params.id);
      const action: unknown = req.body?.action;
      if (reportId === undefined || !isTournamentReportAction(action)) {
        res.status(400).json({ error: "invalid_resolution" });
        return;
      }
      const report = await store.findOpenReport(reportId);
      if (!report) {
        res.status(404).json({ error: "report_not_found" });
        return;
      }
      if (action === TournamentReportAction.DELETE_TOURNAMENT.value) {
        const outcome = await accounts.deleteTournament(report.tournamentId, auth.account.id, true);
        if (outcome === "already_started") {
          res.status(409).json({ error: "tournament_already_started" });
          return;
        }
      }
      const resolved = await store.resolveReports({
        tournamentId: report.tournamentId,
        action,
        adminAccountId: auth.account.id,
      });
      res.json({ resolved });
    }),
  );
}
