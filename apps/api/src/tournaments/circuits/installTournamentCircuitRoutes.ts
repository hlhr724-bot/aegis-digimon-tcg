import { hasAccountCapability } from "@aegis/shared/account/hasAccountCapability";
import type { Express, NextFunction, Request, Response } from "express";
import type { AccountStore, AuthSession } from "#api/accounts/AccountStore";
import { isUuid } from "#api/community/CommunityDeckStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";
import { logError } from "#api/logger";
import { parseCreateTournamentCircuit } from "#api/tournaments/circuits/parseCreateTournamentCircuit";
import { TournamentCircuitStore } from "#api/tournaments/circuits/TournamentCircuitStore";
import { validateCreateTournamentCircuit } from "#api/tournaments/circuits/validateCreateTournamentCircuit";
import type { ParticipantStore } from "#api/tournaments/participants/ParticipantStore";

type Params = {
  app: Express;
  accounts: AccountStore;
  participants: ParticipantStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
  now?: () => number;
};

const MAX_LEADERBOARD_PAGE = 1000;

export function installTournamentCircuitRoutes({ app, accounts, participants, session, now = Date.now }: Params): void {
  const allow = tokenBucketLimiter({ capacity: 60, refillMs: 500 });
  const store = new TournamentCircuitStore(accounts);
  function handle(action: (req: Request, res: Response) => Promise<void>) {
    return (req: Request, res: Response, next: NextFunction): void => {
      res.set("Cache-Control", "private, no-store");
      if (!allow(req.ip ?? "unknown")) {
        res.status(429).set("Retry-After", "2").json({ error: "tournament_circuits_rate_limited" });
        return;
      }
      action(req, res).catch(next);
    };
  }
  async function requireAdmin(req: Request, res: Response): Promise<AuthSession | undefined> {
    const auth = await session(req);
    if (!auth) {
      res.status(401).json({ error: "authentication_required" });
      return undefined;
    }
    if (!auth.account.isAdmin) {
      res.status(403).json({ error: "tournament_circuit_requires_admin" });
      return undefined;
    }
    return auth;
  }

  app.get(
    "/tournament-circuits",
    handle(async (_req, res) => {
      res.json({ items: await store.list(now()) });
    }),
  );

  app.get(
    "/tournament-circuits/:id",
    handle(async (req, res) => {
      const circuitId = String(req.params.id ?? "");
      const view = isUuid(circuitId) ? await store.view(circuitId, now()) : undefined;
      if (!view) {
        res.status(404).json({ error: "tournament_circuit_not_found" });
        return;
      }
      res.json(view);
    }),
  );

  app.get(
    "/tournament-circuits/:id/leaderboard",
    handle(async (req, res) => {
      const circuitId = String(req.params.id ?? "");
      const page = req.query.page === undefined ? 1 : Number(req.query.page);
      if (!Number.isInteger(page) || page < 1 || page > MAX_LEADERBOARD_PAGE) {
        res.status(400).json({ error: "invalid_page" });
        return;
      }
      const auth = await session(req);
      const leaderboard = isUuid(circuitId)
        ? await store.leaderboard({
            circuitId,
            page,
            accountId: auth?.account.id,
          })
        : undefined;
      if (!leaderboard) {
        res.status(404).json({ error: "tournament_circuit_not_found" });
        return;
      }
      res.json(leaderboard);
    }),
  );

  app.post(
    "/tournament-circuits",
    handle(async (req, res) => {
      const auth = await session(req);
      if (!auth) {
        res.status(401).json({ error: "authentication_required" });
        return;
      }
      if (
        !auth.account.isAdmin &&
        !hasAccountCapability({ roles: auth.account.roles, capability: "canOrganizeOfficialTournaments" })
      ) {
        res.status(403).json({ error: "tournament_circuit_requires_organizer" });
        return;
      }
      const parsed = parseCreateTournamentCircuit(req.body);
      if (!parsed) {
        res.status(400).json({ error: "invalid_tournament_circuit" });
        return;
      }
      const current = now();
      const validated = validateCreateTournamentCircuit(parsed, current);
      if (!validated.ok) {
        res.status(400).json({
          error: "invalid_tournament_circuit",
          reasons: validated.errors,
        });
        return;
      }
      res.status(201).json(
        await store.create({
          createdBy: auth.account.id,
          circuit: validated.value,
          now: current,
        }),
      );
    }),
  );

  app.post(
    "/tournament-circuits/:id/cancel",
    handle(async (req, res) => {
      if (!(await requireAdmin(req, res))) {
        return;
      }
      const circuitId = String(req.params.id ?? "");
      const outcome = isUuid(circuitId) ? await store.cancel(circuitId) : { kind: "not_found" as const };
      if (outcome.kind === "not_found") {
        res.status(404).json({ error: "tournament_circuit_not_found" });
        return;
      }
      if (outcome.kind === "closed") {
        res.status(409).json({ error: "tournament_circuit_closed" });
        return;
      }
      const current = now();
      for (const tournamentId of outcome.openTournamentIds) {
        try {
          await participants.cancelTournament({
            tournamentId,
            reason: "circuit_cancelled",
            now: current,
          });
        } catch (error) {
          logError(`[tournament-circuits] cancelling tournament ${tournamentId} failed`, error);
        }
      }
      res.json(await store.view(circuitId, current));
    }),
  );
}
