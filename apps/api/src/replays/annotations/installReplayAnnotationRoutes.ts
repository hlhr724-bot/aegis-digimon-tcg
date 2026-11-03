import type { Express, NextFunction, Request, Response } from "express";
import type { AuthSession } from "#api/accounts/AccountStore";
import { tokenBucketLimiter } from "#api/http/rateLimit";
import type { ReplayAnnotationStore } from "#api/replays/annotations/ReplayAnnotationStore";
import { UUID } from "#api/replays/ReplayLibrary";
import { isReplayMarkerEmoji } from "@aegis/shared/replays/annotations/isReplayMarkerEmoji";
import { isReplayMatchId } from "@aegis/shared/replays/annotations/isReplayMatchId";
import { parseReplayNoteText } from "@aegis/shared/replays/annotations/parseReplayNoteText";
import { MAX_REPLAY_FRAME_INDEX } from "@aegis/shared/replays/annotations/replayAnnotationLimits";

const MAX_TURN = 10_000;

type Params = {
  app: Express;
  store: ReplayAnnotationStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};
type WriteContext = { req: Request; res: Response; authorId: string; matchId: string };

type Moment = { frameIndex: number; turn: number };

function isIntegerBetween(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

function parseMoment(body: Record<string, unknown>): Moment | undefined {
  const { frameIndex, turn } = body;
  if (!isIntegerBetween(frameIndex, MAX_REPLAY_FRAME_INDEX) || !isIntegerBetween(turn, MAX_TURN)) {
    return undefined;
  }
  return { frameIndex, turn };
}

function getBody(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
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

  app.get("/replays/annotations/:matchId", async (req, res, next) => {
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
    "/replays/annotations/:matchId/markers",
    write(async ({ req, res, authorId, matchId }) => {
      const body = getBody(req);
      const moment = parseMoment(body);
      if (!moment) {
        res.status(400).json({ error: "invalid_moment" });
        return;
      }
      if (!isReplayMarkerEmoji(body.emoji)) {
        res.status(400).json({ error: "invalid_emoji" });
        return;
      }
      if (!(await store.canAnnotate({ accountId: authorId, matchId }))) {
        res.status(403).json({ error: "not_allowed" });
        return;
      }
      const result = await store.addMarker({ authorId, matchId, ...moment, emoji: body.emoji });
      if (result.kind === "limit_reached") {
        res.status(409).json({ error: "limit_reached" });
        return;
      }
      res.status(201).json(result.marker);
    }),
  );

  app.delete(
    "/replays/annotations/:matchId/markers/:id",
    write(async ({ req, res, authorId, matchId }) => {
      const id = String(req.params.id ?? "");
      if (!UUID.test(id) || !(await store.removeMarker({ authorId, matchId, id }))) {
        res.sendStatus(404);
        return;
      }
      res.json({ ok: true });
    }),
  );

  app.post(
    "/replays/annotations/:matchId/notes",
    write(async ({ req, res, authorId, matchId }) => {
      const body = getBody(req);
      const moment = parseMoment(body);
      if (!moment) {
        res.status(400).json({ error: "invalid_moment" });
        return;
      }
      const text = parseReplayNoteText(body.text);
      if (text === undefined) {
        res.status(400).json({ error: "invalid_text" });
        return;
      }
      if (!(await store.canAnnotate({ accountId: authorId, matchId }))) {
        res.status(403).json({ error: "not_allowed" });
        return;
      }
      const result = await store.addNote({ authorId, matchId, ...moment, text });
      if (result.kind === "limit_reached") {
        res.status(409).json({ error: "limit_reached" });
        return;
      }
      res.status(201).json(result.note);
    }),
  );

  app.patch(
    "/replays/annotations/:matchId/notes/:id",
    write(async ({ req, res, authorId, matchId }) => {
      const id = String(req.params.id ?? "");
      const text = parseReplayNoteText(getBody(req).text);
      if (text === undefined) {
        res.status(400).json({ error: "invalid_text" });
        return;
      }
      const note = UUID.test(id) ? await store.updateNote({ authorId, matchId, noteId: id, text }) : undefined;
      if (!note) {
        res.sendStatus(404);
        return;
      }
      res.json(note);
    }),
  );

  app.delete(
    "/replays/annotations/:matchId/notes/:id",
    write(async ({ req, res, authorId, matchId }) => {
      const id = String(req.params.id ?? "");
      if (!UUID.test(id) || !(await store.removeNote({ authorId, matchId, id }))) {
        res.sendStatus(404);
        return;
      }
      res.json({ ok: true });
    }),
  );
}
