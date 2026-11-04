import type { Express, NextFunction, Request, Response } from "express";
import type { AuthSession } from "#api/accounts/AccountStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";
import { MATCHUP_LIMITS } from "#api/deckSimulation/MATCHUP_LIMITS";
import { MatchupLimitError } from "#api/deckSimulation/MatchupLimitError";
import { MatchupRequestError } from "#api/deckSimulation/MatchupRequestError";
import type { MatchupSimulator } from "#api/deckSimulation/MatchupSimulator";
import { parseMatchupRequest } from "#api/deckSimulation/parseMatchupRequest";
import type { CommunityMatchupDecks } from "#api/deckSimulation/CommunityMatchupDecks";
import type { MatchupRequest } from "#api/deckSimulation/MatchupRequest";
import type { DeckMatchupResultStore } from "#api/deckSimulation/DeckMatchupResultStore";
import { resolveMatchupRequest } from "#api/deckSimulation/resolveMatchupRequest";

const MAX_DECK_ID_LENGTH = 64;
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Params = {
  app: Express;
  simulator: MatchupSimulator;
  communityDecks: CommunityMatchupDecks;
  results: Pick<DeckMatchupResultStore, "latest">;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

export function installDeckSimulationRoutes({ app, simulator, communityDecks, results, session }: Params): void {
  const reads = tokenBucketLimiter({ capacity: 60, refillMs: 1000 });
  const starts = tokenBucketLimiter(MATCHUP_LIMITS.startsPerAccount);
  const route =
    (work: (req: Request, res: Response, accountId: string) => Promise<void> | void) =>
    async (req: Request, res: Response, next: NextFunction) => {
      res.setHeader("Cache-Control", "private, no-store");
      try {
        const current = await session(req);
        if (!current) {
          res.sendStatus(401);
          return;
        }
        if (!reads(current.account.id)) {
          res.status(429).json({ error: "too_many_requests" });
          return;
        }
        await work(req, res, current.account.id);
      } catch (error) {
        next(error);
      }
    };

  app.post(
    "/account/deck-simulations/matchups",
    route(async (req, res, accountId) => {
      let request: MatchupRequest;
      try {
        request = await resolveMatchupRequest({ draft: parseMatchupRequest(req.body), communityDecks });
      } catch (error) {
        if (error instanceof MatchupRequestError) {
          res.status(400).json({ error: error.code });
          return;
        }
        throw error;
      }
      if (!starts(accountId)) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      try {
        res.status(202).json(simulator.start({ accountId, request }));
      } catch (error) {
        if (error instanceof MatchupLimitError) {
          res.status(error.code === "job_in_progress" ? 409 : 503).json({ error: error.code });
          return;
        }
        throw error;
      }
    }),
  );

  app.get(
    "/account/deck-simulations/decks/:deckId/latest-matchup",
    route(async (req, res, accountId) => {
      const deckId = String(req.params.deckId ?? "");
      const saved =
        deckId.length > 0 && deckId.length <= MAX_DECK_ID_LENGTH
          ? await results.latest({ accountId, deckId })
          : undefined;
      if (saved === undefined) {
        res.sendStatus(404);
        return;
      }
      res.json(saved);
    }),
  );

  app.get(
    "/account/deck-simulations/matchups/:id",
    route((req, res, accountId) => {
      const jobId = String(req.params.id ?? "");
      const job = JOB_ID.test(jobId) ? simulator.get({ accountId, jobId }) : undefined;
      if (job === undefined) {
        res.sendStatus(404);
        return;
      }
      res.json(job);
    }),
  );

  app.delete(
    "/account/deck-simulations/matchups/:id",
    route((req, res, accountId) => {
      const jobId = String(req.params.id ?? "");
      const job = JOB_ID.test(jobId) ? simulator.cancel({ accountId, jobId }) : undefined;
      if (job === undefined) {
        res.sendStatus(404);
        return;
      }
      res.json(job);
    }),
  );

  app.get(
    "/account/deck-simulations/matchups/:id/replays/:index",
    route((req, res, accountId) => {
      const jobId = String(req.params.id ?? "");
      const index = Number(req.params.index);
      const file =
        JOB_ID.test(jobId) && Number.isSafeInteger(index) && index >= 0
          ? simulator.replay({ accountId, jobId, index })
          : undefined;
      if (file === undefined) {
        res.sendStatus(404);
        return;
      }
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="aegis-matchup-${jobId}-${index + 1}.aegis-replay"`);
      res.send(Buffer.from(file));
    }),
  );
}
