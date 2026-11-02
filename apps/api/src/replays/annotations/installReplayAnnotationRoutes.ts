import type { Express, NextFunction, Request, Response } from "express";
import type { AuthSession } from "#api/accounts/AccountStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";
import type { ReplayAnnotationStore } from "#api/replays/annotations/ReplayAnnotationStore";
import { UUID } from "#api/replays/ReplayLibrary";
import { isReplayMarkerEmoji } from "@aegis/shared/replays/annotations/isReplayMarkerEmoji";
import { isReplayMatchId } from "@aegis/shared/replays/annotations/isReplayMatchId";
import { MAX_REPLAY_FRAME_INDEX } from "@aegis/shared/replays/annotations/replayAnnotationLimits";

const MAX_TURN = 10_000;

type Params = {
  app: Express;
  store: ReplayAnnotationStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};
type WriteContext = { req: Request; res: Response; authorId: string; matchId: string };

function isIntegerBetween(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

export function installReplayAnnotationRoutes({ app, store, session }: Params): void {
  const readLimit = tokenBucketLimiter({ capacity: 30, refillMs: 2000 });
  const writeLimit = tokenBucketLimiter({ capacity: 20, refillMs: 3000 });

  const write =
    (work: (context: WriteContext) => Promise<void>) => async (req: Request, res: Response, next: NextFunction) => {
      res.setHeader("Cache-Control", "private, no-store");
      try {
        const current = await session(req);
        if (!current) {
          res.status(401).json({ error: "authentication_required" });
          return;
        }
        if (!writeLimit(current.account.id)) {
          res.status(429).json({ error: "too_many_requests" });
          return;
        }
        const matchId = String(req.params.matchId ?? "");
        if (!isReplayMatchId(matchId)) {
          res.sendStatus(404);
          return;
        }
        await work({ req, res, authorId: current.account.id, matchId });
      } catch (error) {
        next(error);
      }
    };

  app.get("/replay-annotations/:matchId", async (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const viewerId = (await session(req))?.account.id;
      if (!readLimit(viewerId ?? req.ip ?? "unknown")) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      const matchId = String(req.params.matchId ?? "");
      if (!isReplayMatchId(matchId)) {
        res.sendStatus(404);
        return;
      }
      res.json(await store.list({ viewerId, matchId }));
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/replay-annotations/:matchId/markers",
    write(async ({ req, res, authorId, matchId }) => {
      const { frameIndex, turn, emoji } = (req.body ?? {}) as Record<string, unknown>;
      if (!isIntegerBetween(frameIndex, MAX_REPLAY_FRAME_INDEX) || !isIntegerBetween(turn, MAX_TURN)) {
        res.status(400).json({ error: "invalid_moment" });
        return;
      }
      if (!isReplayMarkerEmoji(emoji)) {
        res.status(400).json({ error: "invalid_emoji" });
        return;
      }
      if (!(await store.canAnnotate({ accountId: authorId, matchId }))) {
        res.status(403).json({ error: "not_allowed" });
        return;
      }
      const result = await store.addMarker({ authorId, matchId, frameIndex, turn, emoji });
      if (result.kind === "limit_reached") {
        res.status(409).json({ error: "limit_reached" });
        return;
      }
      res.status(201).json(result.marker);
    }),
  );

  app.delete(
    "/replay-annotations/:matchId/markers/:markerId",
    write(async ({ req, res, authorId, matchId }) => {
      const markerId = String(req.params.markerId ?? "");
      if (!UUID.test(markerId) || !(await store.removeMarker({ authorId, matchId, markerId }))) {
        res.sendStatus(404);
        return;
      }
      res.json({ ok: true });
    }),
  );
}
