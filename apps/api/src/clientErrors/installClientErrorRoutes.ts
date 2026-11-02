import express, { type Express, type Request, type Response } from "express";
import type { ClientErrorReport } from "@aegis/shared/clientErrors/ClientErrorReport";
import type { AuthSession } from "#api/accounts/AccountStore";
import type { ClientErrorAlerts } from "#api/clientErrors/createClientErrorAlerts";
import { parseClientErrorReport } from "#api/clientErrors/parseClientErrorReport";
import { tokenBucketLimiter, type TokenBucketOptions } from "#api/http/rateLimit";
import { log } from "#api/logger";
import { GAME_MESSAGE_LIMITS } from "@aegis/shared/protocol/gameMessageLimits";

export const CLIENT_ERROR_EVENT = "client_error";

const CLIENT_ERROR_RATE_LIMIT: TokenBucketOptions = { capacity: 20, refillMs: 3000 };

export type ClientErrorLogRecord = ClientErrorReport & {
  accountId?: string;
  serverRevision: string;
};

type InstallClientErrorRoutesParams = {
  app: Express;
  session: (req: Request) => Promise<AuthSession | undefined>;
  alerts?: ClientErrorAlerts;
  record?: (record: ClientErrorLogRecord) => void;
  rateLimit?: TokenBucketOptions;
};

function recordToLog(record: ClientErrorLogRecord): void {
  log(CLIENT_ERROR_EVENT, record);
}

export function installClientErrorRoutes({
  app,
  session,
  alerts,
  record = recordToLog,
  rateLimit = CLIENT_ERROR_RATE_LIMIT,
}: InstallClientErrorRoutesParams): void {
  const limitAddress = tokenBucketLimiter(rateLimit);

  async function readAccountId(req: Request): Promise<string | undefined> {
    try {
      return (await session(req))?.account.id;
    } catch {
      return undefined;
    }
  }

  async function accept(req: Request, res: Response): Promise<void> {
    res.set("Cache-Control", "no-store");
    if (!limitAddress(req.ip ?? "unknown")) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    const parsed = parseClientErrorReport(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const accountId = await readAccountId(req);
    record({
      ...parsed.report,
      ...(accountId ? { accountId } : {}),
      serverRevision: process.env.AEGIS_REVISION ?? "development",
    });
    alerts?.notify(parsed.report);
    res.status(204).end();
  }

  app.post(
    "/bug-reports/client-errors",
    express.text({ type: "text/plain", limit: GAME_MESSAGE_LIMITS.maxMessageBytes }),
    (req, res, next) => {
      accept(req, res).catch(next);
    },
  );
}
