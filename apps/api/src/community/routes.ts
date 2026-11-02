import { reviewDeckGuide } from "#api/community/reviewDeckGuide";
import { isDeckFormat } from "@aegis/shared/deckFormat";
import {
  CardColor,
  COMMUNITY_MODERATION_ACTIONS,
  COMMUNITY_MODERATION_NOTE_MAX,
  COMMUNITY_PERIODS,
  COMMUNITY_REPORT_DETAILS_MAX,
  COMMUNITY_REPORT_REASONS,
  COMMUNITY_SORTS,
  type CommunityModerationInput,
  type CommunityPeriod,
  type CommunityReportInput,
  type CommunityReviewError,
  type CommunitySort,
} from "@aegis/shared";
import type { Express, NextFunction, Request, Response } from "express";
import type { AuthSession } from "../accounts/AccountStore.js";
import { tokenBucketLimiter, type TokenBucketOptions } from "../http/rateLimit.js";
import { isUuid, type CommunityDeckStore } from "./CommunityDeckStore.js";
import type { DeckReportTracker } from "./deckReports.js";
import type { DeckReportStore } from "./DeckReportStore.js";

// Generous for a person clicking hearts while browsing, tight for a script.
const LIKE_RATE_LIMIT: TokenBucketOptions = { capacity: 30, refillMs: 2_000 };
const PUBLISH_RATE_LIMIT: TokenBucketOptions = { capacity: 10, refillMs: 30_000 };
// A report is typed by hand and may also become a public issue, so the budget is a few per minute.
const REPORT_RATE_LIMIT: TokenBucketOptions = { capacity: 5, refillMs: 60_000 };
const REVIEW_ERROR_STATUS: Record<CommunityReviewError, number> = {
  deck_not_found: 404,
  deck_not_hidden: 409,
  review_pending: 409,
  deck_not_legal: 422,
  name_not_allowed: 422,
};
const MAX_SEARCH = 60;
const MAX_PAGE = 200;
const DECK_COLORS: readonly string[] = Object.values(CardColor).filter((color) => color !== CardColor.None);

export type CommunityDeckRouteDeps = {
  app: Express;
  store: CommunityDeckStore;
  /** The session lookup the account routes already own, so there is one cookie reader. */
  session: (req: Request) => Promise<AuthSession | undefined>;
  reportStore: DeckReportStore;
  /** Optional public copy of each report; Postgres is always the record. */
  reports?: DeckReportTracker;
};

/**
 * Public decks. Reading is open to everyone, guests included; publishing, liking and counting a
 * copy need an account, because those are the numbers the ranking is built on.
 *
 * Reporting a deck also needs an account. Reports are stored for the admins' moderation queue;
 * hiding the deck or dismissing its reports closes them.
 */
export function installCommunityDeckRoutes({
  app,
  store,
  session,
  reportStore,
  reports,
}: CommunityDeckRouteDeps): void {
  const limitLike = tokenBucketLimiter(LIKE_RATE_LIMIT);
  const limitPublish = tokenBucketLimiter(PUBLISH_RATE_LIMIT);
  const limitReport = tokenBucketLimiter(REPORT_RATE_LIMIT);
  const route =
    (handler: (req: Request<Record<string, string>>, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      handler(req as Request<Record<string, string>>, res).catch(next);
    };
  const requireSession = async (req: Request, res: Response) => {
    const current = await session(req);
    if (!current) res.sendStatus(401);
    return current;
  };

  app.get(
    "/community/decks",
    route(async (req, res) => {
      const viewer = await session(req);
      res.json(await store.list({ ...parseListQuery(req.query), viewerId: viewer?.account.id }));
    }),
  );

  const limitRandom = tokenBucketLimiter({ capacity: 5, refillMs: 5_000 });
  let randomInFlight = 0;
  app.get(
    "/community/decks/random",
    route(async (req, res) => {
      const format = req.query.format ?? "standard";
      if (!isDeckFormat(format) || ![undefined, "true", "false"].includes(req.query.beta as string | undefined)) {
        res.sendStatus(400);
        return;
      }
      if (!limitRandom(req.ip ?? "unknown") || randomInFlight >= 2) {
        res.sendStatus(429);
        return;
      }
      randomInFlight += 1;
      try {
        res.set("Cache-Control", "no-store");
        res.json(await store.randomDeck({ format, betaAllowed: req.query.beta === "true" }));
      } finally {
        randomInFlight -= 1;
      }
    }),
  );

  app.get(
    "/community/decks/:id",
    route(async (req, res) => {
      const viewer = await session(req);
      const deck = await store.deck(req.params.id!, viewer?.account.id, viewer?.account.isAdmin === true);
      if (deck) res.json(deck);
      else res.sendStatus(404);
    }),
  );

  for (const [method, liked] of [
    ["put", true],
    ["delete", false],
  ] as const)
    app[method](
      "/community/decks/:id/like",
      route(async (req, res) => {
        const current = await requireSession(req, res);
        if (!current) return;
        if (!limitLike(current.account.id)) {
          res.status(429).json({ error: "too_many_requests" });
          return;
        }
        const result = liked
          ? await store.like(current.account.id, req.params.id!)
          : await store.unlike(current.account.id, req.params.id!);
        if (result.ok) res.json(result.like);
        else res.status(result.error === "own_deck" ? 403 : 404).json({ error: result.error });
      }),
    );

  app.put(
    "/community/decks/:id/guide",
    route(async (req, res) => {
      const current = await requireSession(req, res);
      if (!current) {
        return;
      }
      if (!limitPublish(current.account.id)) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      const review = reviewDeckGuide({ raw: req.body?.guide });
      if (!review.allowed) {
        res.status(review.error === "invalid_guide" ? 400 : 422).json({ error: review.error });
        return;
      }
      const saved = await store.updateGuide({
        accountId: current.account.id,
        publicDeckId: req.params.id!,
        guide: review.guide,
      });
      if (!saved) {
        res.status(404).json({ error: "deck_not_found" });
        return;
      }
      res.json({ guide: review.guide });
    }),
  );

  app.post(
    "/community/decks/:id/copies",
    route(async (req, res) => {
      const current = await requireSession(req, res);
      if (!current) return;
      res.sendStatus((await store.recordCopy(current.account.id, req.params.id!)) ? 204 : 404);
    }),
  );

  app.post(
    "/community/decks/:id/reports",
    route(async (req, res) => {
      const current = await requireSession(req, res);
      if (!current) return;
      const input = parseReport(req.body);
      if (!input) {
        res.status(400).json({ error: "invalid_report" });
        return;
      }
      if (!limitReport(current.account.id)) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      const target = await store.reportTarget(current.account.id, req.params.id!);
      if (!target.ok) {
        res.status(target.error === "own_deck" ? 403 : 404).json({ error: target.error });
        return;
      }
      await reportStore.record(current.account.id, target.deck.id, input);
      // The public copy must never turn a stored report into a failed one.
      await reports
        ?.report({ deckId: target.deck.id, deckName: target.deck.name, authorName: target.deck.authorName, ...input })
        .catch((failure: unknown) => console.error("[deck-reports] saved report but GitHub mirror failed", failure));
      res.sendStatus(204);
    }),
  );

  const requireAdmin = async (req: Request, res: Response) => {
    const current = await requireSession(req, res);
    if (current && !current.account.isAdmin) {
      res.status(403).json({ error: "admin_required" });
      return undefined;
    }
    return current;
  };

  app.post(
    ["/admin/community/decks/:id/moderation", "/account/admin/community/decks/:id/moderation"],
    route(async (req, res) => {
      if (!(await requireAdmin(req, res))) return;
      const input = parseModeration(req.body);
      if (!input) {
        res.status(400).json({ error: "invalid_action" });
        return;
      }
      const status = await store.moderate(req.params.id!, input);
      if (!status) {
        res.sendStatus(404);
        return;
      }
      // Hiding is the moderator acting on the reports, so they leave the queue.
      if (input.action === "hide") await reportStore.dismiss(req.params.id!);
      res.json({ status });
    }),
  );

  app.get(
    ["/admin/community/reports", "/account/admin/community/reports"],
    route(async (req, res) => {
      res.set("Cache-Control", "no-store");
      if (await requireAdmin(req, res)) res.json({ decks: await reportStore.queue() });
    }),
  );

  app.get(
    ["/admin/community/decks/:id/reports", "/account/admin/community/decks/:id/reports"],
    route(async (req, res) => {
      res.set("Cache-Control", "no-store");
      if (!(await requireAdmin(req, res))) return;
      if (!isUuid(req.params.id!)) {
        res.sendStatus(404);
        return;
      }
      res.json({ reports: await reportStore.openReports(req.params.id!) });
    }),
  );

  app.post(
    ["/admin/community/decks/:id/reports/dismiss", "/account/admin/community/decks/:id/reports/dismiss"],
    route(async (req, res) => {
      if (!(await requireAdmin(req, res))) return;
      if (!isUuid(req.params.id!)) {
        res.sendStatus(404);
        return;
      }
      res.json({ dismissed: await reportStore.dismiss(req.params.id!) });
    }),
  );

  app.get(
    "/community/publications",
    route(async (req, res) => {
      const current = await requireSession(req, res);
      if (current) res.json(await store.publications(current.account.id));
    }),
  );

  app.put(
    "/community/publications/:deckId",
    route(async (req, res) => {
      const current = await requireSession(req, res);
      if (!current) return;
      if (!limitPublish(current.account.id)) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      const result = await store.publish(current.account.id, req.params.deckId!);
      if (result.ok) res.json(result.publication);
      else res.status(result.error === "deck_not_found" ? 404 : 422).json({ error: result.error });
    }),
  );

  app.post(
    "/community/publications/:deckId/review",
    route(async (req, res) => {
      const current = await requireSession(req, res);
      if (!current) return;
      const note = parseNote(req.body?.note);
      if (note === undefined) {
        res.status(400).json({ error: "invalid_review" });
        return;
      }
      if (!limitPublish(current.account.id)) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      const result = await store.requestReview({
        accountId: current.account.id,
        sourceDeckId: req.params.deckId!,
        note,
      });
      if (result.ok) res.json(result.publication);
      else res.status(REVIEW_ERROR_STATUS[result.error]).json({ error: result.error });
    }),
  );

  app.delete(
    "/community/publications/:deckId",
    route(async (req, res) => {
      const current = await requireSession(req, res);
      if (current) res.sendStatus((await store.unpublish(current.account.id, req.params.deckId!)) ? 204 : 404);
    }),
  );
}

function parseModeration(body: unknown): CommunityModerationInput | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { action, reason, note } = body as Record<string, unknown>;
  const knownAction = COMMUNITY_MODERATION_ACTIONS.find((value) => value === action);
  if (knownAction === "restore") return { action: knownAction };
  const parsedNote = parseNote(note);
  if (parsedNote === undefined) return undefined;
  const withNote = parsedNote === null ? {} : { note: parsedNote };
  if (knownAction === "decline_review") return { action: knownAction, ...withNote };
  const knownReason = COMMUNITY_REPORT_REASONS.find((value) => value === reason);
  if (knownAction === "hide" && knownReason) return { action: knownAction, reason: knownReason, ...withNote };
  return undefined;
}

function parseNote(note: unknown): string | null | undefined {
  if (note === undefined || note === null) return null;
  if (typeof note !== "string") return undefined;
  const trimmed = note.trim();
  if (trimmed.length > COMMUNITY_MODERATION_NOTE_MAX) return undefined;
  return trimmed || null;
}

function parseReport(body: unknown): CommunityReportInput | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { reason, details } = body as Record<string, unknown>;
  const knownReason = COMMUNITY_REPORT_REASONS.find((value) => value === reason);
  if (!knownReason) return undefined;
  if (details === undefined || details === null) return { reason: knownReason };
  if (typeof details !== "string") return undefined;
  const trimmed = details.trim();
  if (trimmed.length > COMMUNITY_REPORT_DETAILS_MAX) return undefined;
  return trimmed ? { reason: knownReason, details: trimmed } : { reason: knownReason };
}

function parseListQuery(query: Request["query"]): {
  sort: CommunitySort;
  period: CommunityPeriod;
  colors: string[];
  search: string;
  page: number;
} {
  const text = (key: string) => (typeof query[key] === "string" ? query[key] : "");
  const sort = COMMUNITY_SORTS.find((value) => value === text("sort")) ?? "top";
  const period = COMMUNITY_PERIODS.find((value) => value === text("period")) ?? "week";
  const colors = text("colors")
    .split(",")
    .filter((color) => DECK_COLORS.includes(color));
  const page = Math.min(MAX_PAGE, Math.max(0, Number.parseInt(text("page"), 10) || 0));
  return { sort, period, colors: [...new Set(colors)], search: text("q").slice(0, MAX_SEARCH), page };
}
