import express from "express";
import { MAX_REPLAY_BYTES } from "@aegis/shared/replays";
import { ReplayVisibility } from "@aegis/shared/replays/ReplayVisibility";
import { isDeckFormat } from "@aegis/shared/deckFormat";
import type { Express, Request, Response, NextFunction } from "express";
import type { AuthSession } from "../accounts/AccountStore.js";
import { tokenBucketLimiter } from "../http/rateLimit.js";
import { DRIVE_FILE_ID, ReplayLibraryError, UUID, type ReplayLibrary } from "./ReplayLibrary.js";

const FAILURE_STATUS: Record<ReplayLibraryError["code"], number> = {
  invalid_cursor: 400,
  sharing_disabled: 503,
  drive_unavailable: 502,
  too_large: 502,
};

function getQueryText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function fail(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ReplayLibraryError) res.status(FAILURE_STATUS[error.code]).json({ error: error.code });
  else next(error);
}

export function installReplayRoutes({
  app,
  library,
  session,
}: {
  app: Express;
  library: ReplayLibrary;
  session: (req: Request) => Promise<AuthSession | undefined>;
}): void {
  const friendFiles = library.friendFiles;
  const limit = tokenBucketLimiter({ capacity: 30, refillMs: 2000 });
  const route =
    (work: (req: Request, res: Response, owner: string, id: string) => Promise<void>, withId = true) =>
    async (req: Request, res: Response, next: NextFunction) => {
      res.setHeader("Cache-Control", "private, no-store");
      try {
        const current = await session(req);
        if (!current) {
          res.sendStatus(401);
          return;
        }
        if (!limit(current.account.id)) {
          res.status(429).json({ error: "too_many_requests" });
          return;
        }
        const id = String(req.params.id ?? "");
        if (withId && !UUID.test(id)) {
          res.sendStatus(404);
          return;
        }
        await work(req, res, current.account.id, id);
      } catch (error) {
        fail(error, res, next);
      }
    };
  app.get(
    "/account/replays",
    route(async (req, res, owner) => {
      const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : undefined;
      const requested = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
      res.json(await library.list(owner, { cursor, limit: Number.isFinite(requested) ? requested : undefined }));
    }, false),
  );
  app.put(
    "/account/replays/:id/drive",
    route(async (req, res, owner, id) => {
      const fileId = req.body?.fileId;
      if (typeof fileId !== "string" || !DRIVE_FILE_ID.test(fileId)) {
        res.status(400).json({ error: "invalid_file_id" });
        return;
      }
      const replay = await library.attachDrive(owner, id, fileId);
      if (!replay) {
        res.sendStatus(404);
        return;
      }
      res.json(replay);
    }),
  );
  app.put(
    "/account/replays/:id/visibility",
    route(async (req, res, owner, id) => {
      const visibility = req.body?.visibility;
      if (!Object.values(ReplayVisibility).some((entry) => entry.value === visibility)) {
        res.status(400).json({ error: "invalid_visibility" });
        return;
      }
      if (visibility === "public" && !library.sharing) {
        res.status(503).json({ error: "sharing_disabled" });
        return;
      }
      const replay = await library.setVisibility(
        owner,
        id,
        visibility as import("@aegis/shared/replays/ReplayVisibility").ReplayVisibility,
      );
      if (!replay) {
        res.sendStatus(404);
        return;
      }
      res.json(replay);
    }),
  );
  app.put(
    "/account/replays/:id/friends-file",
    async (req, res, next) => {
      if (!(await session(req))) {
        res.status(401).json({ error: "authentication_required" });
        return;
      }
      next();
    },
    express.raw({ type: "application/octet-stream", limit: MAX_REPLAY_BYTES }),
    route(async (req, res, owner, id) => {
      if (
        !Buffer.isBuffer(req.body) ||
        !(await friendFiles.save({ accountId: owner, replayId: id, archive: req.body }))
      ) {
        res.status(400).json({ error: "invalid_archive_or_limit" });
        return;
      }
      res.json(await library.accessible(owner, id));
    }),
  );
  app.delete(
    "/account/replays/:id",
    route(async (_req, res, owner, id) => {
      if (await library.remove(owner, id)) res.json({ ok: true });
      else res.sendStatus(404);
    }),
  );
  const publicLimit = tokenBucketLimiter({ capacity: 30, refillMs: 2000 });
  const publicRoute =
    (work: (req: Request, res: Response, id: string) => Promise<void>, withId = true) =>
    async (req: Request, res: Response, next: NextFunction) => {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("X-Content-Type-Options", "nosniff");
      try {
        if (!publicLimit(req.ip ?? "unknown")) {
          res.sendStatus(429);
          return;
        }
        const id = String(req.params.id ?? "");
        if (withId && !UUID.test(id)) {
          res.sendStatus(404);
          return;
        }
        await work(req, res, id);
      } catch (error) {
        fail(error, res, next);
      }
    };
  app.get(
    "/replays/public",
    publicRoute(async (req, res) => {
      const format = getQueryText(req.query.format);
      if (format !== undefined && !isDeckFormat(format)) {
        res.status(400).json({ error: "invalid_format" });
        return;
      }
      const requested = Number(getQueryText(req.query.limit));
      res.json(
        await library.listPublic({
          viewerId: (await session(req))?.account.id,
          cursor: getQueryText(req.query.cursor),
          limit: Number.isFinite(requested) ? requested : undefined,
          format,
        }),
      );
    }, false),
  );
  app.get(
    "/replays/:id",
    publicRoute(async (req, res, id) => {
      const replay = await library.accessible((await session(req))?.account.id, id);
      if (!replay) {
        res.sendStatus(404);
        return;
      }
      res.json(replay);
    }),
  );
  app.get(
    "/replays/:id/file",
    publicRoute(async (req, res, id) => {
      const viewerId = (await session(req))?.account.id;
      const replay = await library.accessible(viewerId, id);
      if (!replay) {
        res.sendStatus(404);
        return;
      }
      const bytes =
        replay.visibility === ReplayVisibility.FRIENDS.value
          ? await friendFiles.read(id)
          : await library.publicFile(id);
      if (!bytes) {
        res.sendStatus(404);
        return;
      }
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="aegis-${id}.aegis-replay"`);
      res.send(bytes);
    }),
  );
}
