import type { Express, NextFunction, Request, Response } from "express";
import { matchMaker } from "colyseus";
import { ROOM_TYPE_TOURNAMENT } from "@aegis/shared";
import type { AccountStore, AuthSession, Tournament } from "#api/accounts/AccountStore";
import { isUuid } from "#api/community/CommunityDeckStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";
import type { SeriesStore } from "#api/tournaments/series/SeriesStore";
import { canSpectateTournament } from "#api/tournaments/spectators/canSpectateTournament";
import { TournamentSpectatorStore } from "#api/tournaments/spectators/TournamentSpectatorStore";
import { isTournamentSpectatorPolicy } from "@aegis/shared/tournaments/isTournamentSpectatorPolicy";
import type { TournamentSpectatorSettings } from "@aegis/shared/tournaments/TournamentSpectatorSettings";

type Params = {
  app: Express;
  accounts: AccountStore;
  series: SeriesStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

type OrganizerHandler = (params: OrganizerContext) => Promise<void>;
type OrganizerContext = { req: Request; res: Response; tournament: Tournament };

const MAX_DISPLAY_NAME_LENGTH = 64;

export function installTournamentSpectatorRoutes({ app, accounts, series, session }: Params): void {
  const spectators = new TournamentSpectatorStore(accounts);
  const allowManagement = tokenBucketLimiter({ capacity: 30, refillMs: 2_000 });
  const allowSpectate = tokenBucketLimiter({ capacity: 10, refillMs: 3_000 });

  function organizerRoute(handler: OrganizerHandler) {
    return (req: Request, res: Response, next: NextFunction): void => {
      res.set("Cache-Control", "private, no-store");
      void (async () => {
        const auth = await session(req);
        if (!auth) {
          res.status(401).json({ error: "authentication_required" });
          return;
        }
        if (!allowManagement(auth.account.id)) {
          res.status(429).json({ error: "too_many_requests" });
          return;
        }
        const tournamentId = String(req.params.id);
        const tournament = isUuid(tournamentId) ? await accounts.tournament(tournamentId) : undefined;
        if (!tournament) {
          res.status(404).json({ error: "tournament_not_found" });
          return;
        }
        if (tournament.createdBy !== auth.account.id && !auth.account.isAdmin) {
          res.status(403).json({ error: "organizer_required" });
          return;
        }
        await handler({ req, res, tournament });
      })().catch(next);
    };
  }

  async function sendSettings(res: Response, tournamentId: string): Promise<void> {
    const tournament = await accounts.tournament(tournamentId);
    if (!tournament) {
      res.status(404).json({ error: "tournament_not_found" });
      return;
    }
    const settings: TournamentSpectatorSettings = {
      policy: tournament.spectatorPolicy,
      spectators: await spectators.list(tournamentId),
    };
    res.json(settings);
  }

  app.get(
    "/tournaments/:id/spectators",
    organizerRoute(async ({ res, tournament }) => sendSettings(res, tournament.id)),
  );

  app.put(
    "/tournaments/:id/spectators/policy",
    organizerRoute(async ({ req, res, tournament }) => {
      const policy: unknown = req.body?.policy;
      if (!isTournamentSpectatorPolicy(policy)) {
        res.status(400).json({ error: "invalid_spectator_policy" });
        return;
      }
      await spectators.setPolicy({ tournamentId: tournament.id, policy });
      await sendSettings(res, tournament.id);
    }),
  );

  app.post(
    "/tournaments/:id/spectators",
    organizerRoute(async ({ req, res, tournament }) => {
      const displayName: unknown = req.body?.displayName;
      if (typeof displayName !== "string" || !displayName.trim() || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        res.status(400).json({ error: "invalid_display_name" });
        return;
      }
      const outcome = await spectators.add({ tournamentId: tournament.id, displayName, now: Date.now() });
      if (outcome.kind === "account_not_found") {
        res.status(404).json({ error: "spectator_account_not_found" });
        return;
      }
      if (outcome.kind === "limit_reached") {
        res.status(409).json({ error: "spectator_limit_reached" });
        return;
      }
      await sendSettings(res, tournament.id);
    }),
  );

  app.delete(
    "/tournaments/:id/spectators/:accountId",
    organizerRoute(async ({ req, res, tournament }) => {
      const accountId = String(req.params.accountId);
      if (isUuid(accountId)) {
        await spectators.remove({ tournamentId: tournament.id, accountId });
      }
      await sendSettings(res, tournament.id);
    }),
  );

  app.post("/spectate/tournament", (req: Request, res: Response, next: NextFunction): void => {
    res.set("Cache-Control", "no-store");
    void (async () => {
      const { tournamentId, matchId, authTicket } = req.body ?? {};
      if (!isUuid(String(tournamentId)) || !isUuid(String(matchId)) || typeof authTicket !== "string") {
        res.status(400).json({ error: "invalid_spectate_request" });
        return;
      }
      const roomId = await findLiveRoomId({ series, tournamentId, matchId });
      const [listing] = roomId ? await matchMaker.query({ roomId }) : [];
      if (!listing || listing.name !== ROOM_TYPE_TOURNAMENT) {
        res.status(404).json({ error: "match_not_live" });
        return;
      }
      const ticket = await accounts.consumeRoomTicket(authTicket);
      if (!ticket || ticket.tournamentMatchId) {
        res.status(401).json({ error: "authentication_required" });
        return;
      }
      if (!allowSpectate(ticket.account.id)) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      const tournament = await accounts.tournament(tournamentId);
      if (!tournament || !(await canSpectateTournament({ tournament, account: ticket.account, spectators }))) {
        res.status(403).json({ error: "spectating_not_allowed" });
        return;
      }
      try {
        const reservation = await matchMaker.reserveSeatFor(listing, {
          spectator: true,
          authTicket: await accounts.createRoomTicket(ticket.account.id),
          displayName: ticket.account.displayName,
          deck: { mainDeck: [], eggDeck: [] },
        });
        res.json(reservation);
      } catch {
        res.status(409).json({ error: "match_not_live" });
      }
    })().catch(next);
  });
}

type LiveRoomParams = { series: SeriesStore; tournamentId: string; matchId: string };

async function findLiveRoomId({ series, tournamentId, matchId }: LiveRoomParams): Promise<string | undefined> {
  const record = await series.seriesForMatch(matchId);
  if (!record || record.tournamentId !== tournamentId) {
    return undefined;
  }
  const game = record.games.findLast((entry) => entry.status === "playing" && entry.roomId !== null);
  return game?.roomId ?? undefined;
}
