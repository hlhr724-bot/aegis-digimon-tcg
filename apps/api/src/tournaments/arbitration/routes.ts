import type { Express, Request, Response } from "express";
import type { AccountStore, AuthSession } from "../../accounts/AccountStore.js";
import type { ArbitrationFailure, ArbitrationResult, SeriesDecision } from "./ArbitrationService.js";
import type { ArbitrationService } from "./ArbitrationService.js";
import { ARBITRATION_RATE_LIMIT, tokenBucketLimiter, type RateLimiter } from "./rateLimit.js";

/** Which refusals are the caller asking for something absent rather than something forbidden. */
const NOT_FOUND: readonly ArbitrationFailure[] = [
  "tournament_not_found",
  "series_not_found",
  "match_not_found",
  "participant_not_found",
];
const FORBIDDEN: readonly ArbitrationFailure[] = ["not_organizer", "not_a_participant"];
const BAD_REQUEST: readonly ArbitrationFailure[] = ["reason_required"];

export type ArbitrationRouteDeps = {
  app: Express;
  accounts: AccountStore;
  arbitration: ArbitrationService;
  /** The session lookup the surrounding route module already owns, so there is one cookie reader. */
  session: (req: Request) => Promise<AuthSession | undefined>;
  limiter?: RateLimiter;
};

/**
 * The organizer's HTTP surface.
 *
 * Installed separately from the account routes rather than folded into them: these five endpoints
 * are the only ones in the API that overrule a recorded result, and keeping them in their own module
 * — with their own rate limit and their own refusal vocabulary — is what makes "who may change a
 * result, and how often" a question with one file for an answer.
 *
 * Every command takes a `reason` and an optional `commandId`. The reason is refused when blank
 * (400), not defaulted; the id makes a retry a replay instead of a second decision.
 */
export function installArbitrationRoutes({ app, arbitration, session, limiter }: ArbitrationRouteDeps): void {
  const limit = limiter ?? tokenBucketLimiter(ARBITRATION_RATE_LIMIT);

  const command = <T>(
    path: string,
    run: (input: {
      // Express 5 types params as string | string[]; arrays only come from *wildcard segments, which these paths do not use.
      req: Request<Record<string, string>>;
      accountId: string;
      reason: string;
      commandId?: string;
    }) => Promise<ArbitrationResult<T>>,
  ) =>
    app.post(path, (req, res, next) => {
      void (async () => {
        const auth = await session(req);
        if (!auth) {
          res.sendStatus(401);
          return;
        }
        if (!limit(auth.account.id)) {
          res.status(429).json({ error: "too_many_arbitration_commands" });
          return;
        }
        const body = (req.body ?? {}) as { reason?: unknown; commandId?: unknown };
        const reason = typeof body.reason === "string" ? body.reason : "";
        const commandId = typeof body.commandId === "string" && body.commandId ? body.commandId : undefined;
        const result = await run({
          req: req as Request<Record<string, string>>,
          accountId: auth.account.id,
          reason,
          commandId,
        });
        if (!result.ok) {
          send(res, result.reason);
          return;
        }
        // `sequence`/`reasonCode` are null when nothing changed, because there is no event to name.
        // The organizer's client shows "already done" from `alreadyApplied` rather than inferring it
        // from a missing field.
        res.json({
          replayed: result.replayed,
          alreadyApplied: result.alreadyApplied,
          sequence: result.event?.sequence ?? null,
          commandId: result.event?.commandId ?? commandId ?? null,
          reasonCode: result.event?.reasonCode ?? null,
          result: result.value ?? null,
        });
      })().catch(next);
    });

  command("/tournaments/:id/arbitration/pairings/swap", async ({ req, accountId, reason, commandId }) => {
    const { firstMatchId, firstSeat, secondMatchId, secondSeat } = (req.body ?? {}) as Record<string, unknown>;
    if (
      typeof firstMatchId !== "string" ||
      typeof secondMatchId !== "string" ||
      (firstSeat !== 0 && firstSeat !== 1) ||
      (secondSeat !== 0 && secondSeat !== 1)
    ) {
      return { ok: false, reason: "pairings_not_editable" } as const;
    }
    return arbitration.swapPairings({
      tournamentId: req.params.id!,
      actorAccountId: accountId,
      reason,
      commandId,
      firstMatchId,
      firstSeat,
      secondMatchId,
      secondSeat,
    });
  });

  command("/tournaments/:id/arbitration/series/:seriesId/decide", async ({ req, accountId, reason, commandId }) => {
    const decision = parseDecision((req.body ?? {}) as Record<string, unknown>);
    if (!decision) return { ok: false, reason: "not_a_participant" } as const;
    return arbitration.decideSeries({
      tournamentId: req.params.id!,
      seriesId: req.params.seriesId!,
      actorAccountId: accountId,
      decision,
      reason,
      commandId,
    });
  });

  command("/tournaments/:id/arbitration/matches/:matchId/concede", async ({ req, accountId, reason, commandId }) => {
    const body = (req.body ?? {}) as { byAccountId?: unknown };
    // Defaults to the caller: the common case is a player conceding their own confrontation, and an
    // organizer conceding on someone's behalf has to name them explicitly.
    const byAccountId = typeof body.byAccountId === "string" && body.byAccountId ? body.byAccountId : accountId;
    return arbitration.concedeMatch({
      tournamentId: req.params.id!,
      matchId: req.params.matchId!,
      actorAccountId: accountId,
      byAccountId,
      reason,
      commandId,
    });
  });

  command(
    "/tournaments/:id/arbitration/participants/:participantId/disqualify",
    async ({ req, accountId, reason, commandId }) =>
      arbitration.disqualify({
        tournamentId: req.params.id!,
        participantId: req.params.participantId!,
        actorAccountId: accountId,
        reason,
        commandId,
      }),
  );

  command("/tournaments/:id/arbitration/cancel", async ({ req, accountId, reason, commandId }) =>
    arbitration.cancelTournament({ tournamentId: req.params.id!, actorAccountId: accountId, reason, commandId }),
  );

  command("/tournaments/:id/arbitration/matches/:matchId/correct", async ({ req, accountId, reason, commandId }) => {
    const decision = parseDecision((req.body ?? {}) as Record<string, unknown>);
    if (!decision) return { ok: false, reason: "not_a_participant" } as const;
    const wins = (req.body as { correctedWins?: unknown }).correctedWins;
    return arbitration.correctResult({
      tournamentId: req.params.id!,
      matchId: req.params.matchId!,
      actorAccountId: accountId,
      decision,
      reason,
      commandId,
      correctedWins: parseWins(wins),
    });
  });

  // The trail itself. Organizer-only for the same reason the commands are: it names who decided
  // what, and a participant reading their opponents' rulings is a different product decision.
  app.get("/tournaments/:id/arbitration/events", (req, res, next) => {
    void (async () => {
      const auth = await session(req);
      if (!auth) {
        res.sendStatus(401);
        return;
      }
      const trail = await arbitration.trail(req.params.id!);
      // An empty trail for a tournament nobody owns must not distinguish "not yours" from "no
      // events", so authorization is checked through the same command path the writes use.
      const allowed = await arbitration.canArbitrate(req.params.id!, auth.account.id);
      if (!allowed) {
        res.sendStatus(403);
        return;
      }
      res.json(trail);
    })().catch(next);
  });
}

function send(res: Response, reason: ArbitrationFailure): void {
  const status = NOT_FOUND.includes(reason)
    ? 404
    : FORBIDDEN.includes(reason)
      ? 403
      : BAD_REQUEST.includes(reason)
        ? 400
        : 409;
  res.status(status).json({ error: reason });
}

/** An organizer-stated score. Absent means "derive it"; see `SeriesStore`'s `coherentWins`. */
function parseWins(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const [first, second] = value;
  if (!Number.isInteger(first) || !Number.isInteger(second) || first < 0 || second < 0) return undefined;
  return [first as number, second as number];
}

/**
 * The wire spelling of a decision. `winnerAccountId` names an account, `winnerParticipantId` a seat
 * with no account (a bot), and the two collective outcomes name themselves.
 */
function parseDecision(body: Record<string, unknown>): SeriesDecision | undefined {
  const { decision, winnerAccountId, winnerParticipantId } = body;
  if (decision === "draw") return { kind: "draw" };
  if (decision === "double_loss") return { kind: "double_loss" };
  if (typeof winnerAccountId === "string" && winnerAccountId)
    return { kind: "winner_account", accountId: winnerAccountId };
  if (typeof winnerParticipantId === "string" && winnerParticipantId)
    return { kind: "winner_participant", participantId: winnerParticipantId };
  return undefined;
}
