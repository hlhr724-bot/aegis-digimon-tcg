import type { FeedbackStore } from "./FeedbackStore.js";
import { getCardDefinition } from "@aegis/shared";
import { isSubmittableFeedbackKind } from "@aegis/shared/feedback/isSubmittableFeedbackKind";
import type { Express, Request, Response } from "express";
import type { AuthSession } from "../accounts/AccountStore.js";
import { tokenBucketLimiter, type TokenBucketOptions } from "../http/rateLimit.js";
import { captureReportReplay, type ReplayCapturer } from "./replayCapture.js";
import { installFeedbackTriageRoutes } from "./triageRoutes.js";
import {
  MAX_BUG_REPORT_CARDS,
  MAX_BUG_REPORT_DESCRIPTION,
  MAX_BUG_REPORT_OPPONENT_DECK,
  MAX_BUG_REPORT_SUMMARY,
  type IssueTracker,
  type NewBugReport,
  type ReplayOutcome,
} from "./GitHubIssueTracker.js";

// A report is typed by hand, so a handful per minute is already far above human pace. The limit is
// there to protect feedback storage and the optional public GitHub mirror.
const SIGNED_IN_RATE_LIMIT: TokenBucketOptions = { capacity: 5, refillMs: 60_000 };

// An anonymous reporter is only as identifiable as their address, and an address is cheap to change,
// so the anonymous budget is much smaller than the one an account gets. It is still several reports
// per session for anyone hitting a genuinely broken card.
const ANONYMOUS_RATE_LIMIT: TokenBucketOptions = { capacity: 3, refillMs: 5 * 60_000 };

// Long enough for any real browser string, short enough that it cannot become the payload.
const MAX_USER_AGENT = 300;
const MAX_CLIENT_REVISION = 60;

export type BugReportRouteDeps = {
  app: Express;
  store: FeedbackStore;
  /** Optional GitHub mirror; database storage is always enabled. */
  tracker?: IssueTracker;
  /** The session lookup the account routes already own, so there is one cookie reader. */
  session: (req: Request) => Promise<AuthSession | undefined>;
  /**
   * Copies the reported match's replay out of the logs; absent means reports are filed without one.
   * Only accepted reports (past the rate limit and validation) ever reach it.
   */
  replayCapture?: ReplayCapturer;
};

/** Public submissions persist before mirroring. Admins triage them; signed-in reporters follow their own. */
export function installBugReportRoutes({ app, store, tracker, session, replayCapture }: BugReportRouteDeps): void {
  const limitAccount = tokenBucketLimiter(SIGNED_IN_RATE_LIMIT);
  const limitAddress = tokenBucketLimiter(ANONYMOUS_RATE_LIMIT);

  app.get("/bug-reports/limits", (_req, res) => {
    res.json({
      maxCards: MAX_BUG_REPORT_CARDS,
      maxSummary: MAX_BUG_REPORT_SUMMARY,
      maxDescription: MAX_BUG_REPORT_DESCRIPTION,
      maxOpponentDeck: MAX_BUG_REPORT_OPPONENT_DECK,
      enabled: true,
      // The form tells reporters whether their words may end up on a public repository.
      publicMirror: tracker !== undefined,
    });
  });

  app.post("/bug-reports", (req, res, next) => {
    submit(req, res).catch(next);
  });

  installFeedbackTriageRoutes({ app, store, session });

  async function submit(req: Request, res: Response): Promise<void> {
    const auth = await session(req);
    // An account is its own identity; without one the caller's address is all there is to meter by,
    // and `trust proxy` is what makes that address the reporter's rather than the proxy's.
    const allowed = auth ? limitAccount(auth.account.id) : limitAddress(req.ip ?? "unknown");
    if (!allowed) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    const report = validate(req.body, auth?.account.displayName);
    if ("error" in report) {
      res.status(400).json({ error: report.error });
      return;
    }
    const mirror = report.kind === "bug" ? tracker : undefined;
    let id: number;
    try {
      id = await store.save(report, auth?.account.id, mirror !== undefined);
    } catch (failure) {
      console.error("[bug-reports] could not save feedback", failure);
      res.status(503).json({ error: "reports_unavailable" });
      return;
    }
    // The replay is captured before the GitHub copy so the public issue can say whether one was
    // kept. It is bounded by the capturer's time budget and never throws, so it can delay the
    // response by at most that budget and can never fail it.
    let replay: ReplayOutcome | undefined;
    if (report.matchId && replayCapture) replay = await captureReportReplay(store, replayCapture, id, report.matchId);
    if (!mirror) {
      res.status(201).json({ number: id });
      return;
    }
    let issue;
    try {
      issue = await mirror.file(report, replay ? { replay } : {});
    } catch (failure) {
      console.error("[bug-reports] saved feedback but GitHub mirror failed", failure);
    }
    // A tracking update must never turn an already saved report into a failed submission.
    try {
      await store.recordMirror(id, issue);
    } catch (failure) {
      console.error("[bug-reports] could not update mirror status", failure);
    }
    res.status(201).json(issue ?? { number: id });
  }
}

/** Why a submission was refused, in the vocabulary the client renders. */
export type BugReportFailure =
  | "invalid_kind"
  | "empty_summary"
  | "summary_too_long"
  | "empty_description"
  | "description_too_long"
  | "opponent_deck_too_long"
  | "too_many_cards"
  | "unknown_card";

type SubmitBody = {
  kind?: unknown;
  summary?: unknown;
  cardIds?: unknown;
  description?: unknown;
  opponentDeck?: unknown;
  matchId?: unknown;
  clientRevision?: unknown;
  userAgent?: unknown;
};

/**
 * The rules a report must satisfy before it becomes a public issue: a known kind, a summary and a
 * description within their length budgets, and card ids that name real cards.
 *
 * The client-carried context (revision, user agent) is trimmed rather than refused — a report is
 * worth filing even when a browser sends something odd.
 */
export function validate(body: unknown, reporterName?: string): NewBugReport | { error: BugReportFailure } {
  const input = (body ?? {}) as SubmitBody;

  // Clients from before feedback kinds existed send none, and everything they sent was a bug.
  const kind = input.kind ?? "bug";
  if (!isSubmittableFeedbackKind(kind)) return { error: "invalid_kind" };

  const summary = text(input.summary);
  if (!summary) return { error: "empty_summary" };
  if (summary.length > MAX_BUG_REPORT_SUMMARY) return { error: "summary_too_long" };

  const description = text(input.description);
  if (!description) return { error: "empty_description" };
  if (description.length > MAX_BUG_REPORT_DESCRIPTION) return { error: "description_too_long" };

  const opponentDeck = text(input.opponentDeck);
  if (opponentDeck && opponentDeck.length > MAX_BUG_REPORT_OPPONENT_DECK) {
    return { error: "opponent_deck_too_long" };
  }

  const raw = Array.isArray(input.cardIds) ? input.cardIds : [];
  if (!raw.every((cardId) => typeof cardId === "string")) return { error: "unknown_card" };
  const cardIds = [...new Set((raw as string[]).map((cardId) => cardId.trim().toUpperCase()).filter(Boolean))];
  if (cardIds.length > MAX_BUG_REPORT_CARDS) return { error: "too_many_cards" };
  if (cardIds.some((cardId) => !getCardDefinition(cardId))) return { error: "unknown_card" };

  return {
    ...(reporterName ? { reporterName } : {}),
    kind,
    summary,
    cardIds,
    description,
    ...(opponentDeck ? { opponentDeck } : {}),
    ...optional("matchId", matchId(input.matchId)),
    ...optional("clientRevision", clip(input.clientRevision, MAX_CLIENT_REVISION)),
    ...optional("userAgent", clip(input.userAgent, MAX_USER_AGENT)),
  };
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Room matchLogId is a UUID from randomUUID; malformed optional context must not lose a report. */
function matchId(value: unknown): string | undefined {
  const id = text(value);
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id.toLowerCase()
    : undefined;
}

function clip(value: unknown, limit: number): string | undefined {
  return text(value)?.slice(0, limit);
}

function optional<K extends string>(key: K, value: string | undefined): Record<K, string> | Record<string, never> {
  return value ? ({ [key]: value } as Record<K, string>) : {};
}
