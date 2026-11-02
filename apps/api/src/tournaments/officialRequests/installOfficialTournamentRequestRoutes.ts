import type { Express, NextFunction, Request, Response } from "express";
import type { AuthSession } from "#api/accounts/AccountStore";
import { isUuid } from "#api/community/CommunityDeckStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";
import type {
  OfficialTournamentRequestFailure,
  OfficialTournamentRequestStore,
} from "#api/tournaments/officialRequests/OfficialTournamentRequestStore";
import { parseOfficialTournamentRequestMessage } from "#api/tournaments/officialRequests/parseOfficialTournamentRequestMessage";

type OfficialTournamentRequestRouteDeps = {
  app: Express;
  store: OfficialTournamentRequestStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

type Handler = (req: Request, res: Response, auth: AuthSession, tournamentId: string) => Promise<void>;

const FAILURE_STATUS: Record<OfficialTournamentRequestFailure, number> = {
  tournament_not_found: 404,
  not_organizer: 403,
  tournament_already_started: 409,
  already_official: 409,
  request_pending: 409,
};

export function installOfficialTournamentRequestRoutes({
  app,
  store,
  session,
}: OfficialTournamentRequestRouteDeps): void {
  const limitSubmit = tokenBucketLimiter({ capacity: 5, refillMs: 60_000 });
  const route =
    (handler: Handler) =>
    (req: Request, res: Response, next: NextFunction): void => {
      res.set("Cache-Control", "no-store");
      void (async () => {
        const auth = await session(req);
        if (!auth) {
          res.status(401).json({ error: "authentication_required" });
          return;
        }
        const tournamentId = String(req.params.id);
        const organizer = isUuid(tournamentId) ? await store.organizerOf(tournamentId) : undefined;
        if (!organizer) {
          res.status(404).json({ error: "tournament_not_found" });
          return;
        }
        if (organizer !== auth.account.id) {
          res.status(403).json({ error: "not_organizer" });
          return;
        }
        await handler(req, res, auth, tournamentId);
      })().catch(next);
    };

  app.get(
    "/tournaments/:id/official-request",
    route(async (_req, res, _auth, tournamentId) => {
      res.json({ request: await store.latest(tournamentId) });
    }),
  );

  app.post(
    "/tournaments/:id/official-request",
    route(async (req, res, auth, tournamentId) => {
      const input = parseOfficialTournamentRequestMessage(req.body);
      if (!input) {
        res.status(400).json({ error: "invalid_official_request" });
        return;
      }
      if (!limitSubmit(auth.account.id)) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      const result = await store.submit({
        tournamentId,
        accountId: auth.account.id,
        reporterName: auth.account.displayName,
        message: input.message,
      });
      if ("error" in result) {
        res.status(FAILURE_STATUS[result.error]).json({ error: result.error });
        return;
      }
      res.status(201).json({ request: result });
    }),
  );

  app.delete(
    "/tournaments/:id/official-request",
    route(async (_req, res, auth, tournamentId) => {
      if (!(await store.cancel(tournamentId, auth.account.id))) {
        res.status(404).json({ error: "request_not_found" });
        return;
      }
      res.json({ request: await store.latest(tournamentId) });
    }),
  );
}
