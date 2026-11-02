import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientErrorReport } from "@aegis/shared/clientErrors/ClientErrorReport";
import { GAME_MESSAGE_LIMITS } from "@aegis/shared/protocol/gameMessageLimits";
import type { AuthSession } from "#api/accounts/AccountStore";
import { createClientErrorAlerts } from "#api/clientErrors/createClientErrorAlerts";
import { installClientErrorRoutes, type ClientErrorLogRecord } from "#api/clientErrors/installClientErrorRoutes";
import { parseClientErrorReport } from "#api/clientErrors/parseClientErrorReport";
import { postDiscordWebhook } from "#api/clientErrors/postDiscordWebhook";

const report: ClientErrorReport = {
  kind: "error",
  message: "TypeError: Cannot read properties of undefined (reading 'length')",
  stack: "TypeError: x\n    at Pe (https://aegis-digi.online/assets/GameScreen-a.js:12:34)",
  signature: "TypeError: Cannot read properties of undefined (reading 'length') @ /assets/GameScreen-a.js:12:34",
  release: "0123456789abcdef",
  route: "/game",
  matchId: "3f2c1d4e-1111-2222-3333-444455556666",
  userAgent: "TestBrowser/1.0",
  occurredAt: "2026-10-13T12:00:00.000Z",
};

const servers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((close) => close()));
});

type HarnessParams = {
  session?: (req: express.Request) => Promise<AuthSession | undefined>;
  notify?: (report: ClientErrorReport) => void;
  capacity?: number;
};

async function startHarness({
  session = async () => undefined,
  notify = () => undefined,
  capacity = 20,
}: HarnessParams = {}) {
  const records: ClientErrorLogRecord[] = [];
  const app = express();
  app.use(express.json());
  installClientErrorRoutes({
    app,
    session,
    alerts: { notify, flush: async () => undefined },
    record: (record) => records.push(record),
    rateLimit: { capacity, refillMs: 60_000 },
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  servers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/bug-reports/client-errors`;
  const post = (body: string, contentType = "text/plain;charset=UTF-8") =>
    fetch(url, { method: "POST", headers: { "Content-Type": contentType }, body });
  return { records, post };
}

describe("client error endpoint", () => {
  it("logs a beacon report sent as plain text", async () => {
    const { records, post } = await startHarness();
    const response = await post(JSON.stringify(report));
    expect(response.status).toBe(204);
    expect(records).toEqual([{ ...report, serverRevision: "development" }]);
  });

  it("accepts a JSON report", async () => {
    const { records, post } = await startHarness();
    expect((await post(JSON.stringify(report), "application/json")).status).toBe(204);
    expect(records).toHaveLength(1);
  });

  it("attaches the signed-in account when the request carries a session", async () => {
    const session = async () => ({ account: { id: "account-1" } }) as AuthSession;
    const { records, post } = await startHarness({ session });
    await post(JSON.stringify(report));
    expect(records[0]?.accountId).toBe("account-1");
  });

  it("still logs the report when the session lookup fails", async () => {
    const { records, post } = await startHarness({
      session: async () => {
        throw new Error("database down");
      },
    });
    expect((await post(JSON.stringify(report))).status).toBe(204);
    expect(records[0]?.accountId).toBeUndefined();
  });

  it("refuses an invalid report without logging it", async () => {
    const { records, post } = await startHarness();
    const response = await post(JSON.stringify({ ...report, kind: "crash" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_kind" });
    expect(records).toEqual([]);
  });

  it("refuses an oversized body", async () => {
    const { records, post } = await startHarness();
    const response = await post(JSON.stringify({ ...report, stack: "s".repeat(GAME_MESSAGE_LIMITS.maxMessageBytes) }));
    expect(response.status).toBe(413);
    expect(records).toEqual([]);
  });

  it("rate-limits one address", async () => {
    const { records, post } = await startHarness({ capacity: 2 });
    const statuses = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      statuses.push((await post(JSON.stringify(report))).status);
    }
    expect(statuses).toEqual([204, 204, 429]);
    expect(records).toHaveLength(2);
  });

  it("passes accepted reports to the alerts", async () => {
    const notify = vi.fn();
    const { post } = await startHarness({ notify });
    await post(JSON.stringify(report));
    expect(notify).toHaveBeenCalledWith(report);
  });
});

describe("client error validation", () => {
  it.each([
    ["invalid_body", "not json"],
    ["invalid_body", [report]],
    ["invalid_message", { ...report, message: "" }],
    ["invalid_message", { ...report, message: "m".repeat(1001) }],
    ["invalid_stack", { ...report, stack: 7 }],
    ["invalid_signature", { ...report, signature: "s".repeat(401) }],
    ["invalid_release", { ...report, release: "abc def" }],
    ["invalid_route", { ...report, route: "/".repeat(201) }],
    ["invalid_room_id", { ...report, roomId: "room id" }],
    ["invalid_match_id", { ...report, matchId: "" }],
    ["invalid_user_agent", { ...report, userAgent: "u".repeat(301) }],
    ["invalid_occurred_at", { ...report, occurredAt: "yesterday" }],
  ])("refuses %s", (error, body) => {
    expect(parseClientErrorReport(body)).toEqual({ error });
  });

  it("keeps only known fields", () => {
    expect(parseClientErrorReport({ ...report, extra: "x" })).toEqual({ report });
  });
});

describe("client error alerts", () => {
  it("alerts the first time a signature appears in a release", async () => {
    const deliver = vi.fn(async (_content: string) => undefined);
    const alerts = createClientErrorAlerts({ deliver, reportFailure: () => undefined });
    alerts.notify(report);
    alerts.notify(report);
    alerts.notify({ ...report, release: "fedcba9876543210" });
    await alerts.flush();
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(String(deliver.mock.calls[0]?.[0])).toContain(report.signature);
    expect(String(deliver.mock.calls[0]?.[0])).toContain(
      "at Pe (https://aegis-digi.online/assets/GameScreen-a.js:12:34)",
    );
    expect(String(deliver.mock.calls[0]?.[0])).toContain("TestBrowser/1.0");
  });

  it("forgets the oldest signature when the tracking limit is reached", async () => {
    const deliver = vi.fn(async () => undefined);
    const alerts = createClientErrorAlerts({ deliver, reportFailure: () => undefined, maxTrackedSignatures: 2 });
    for (const signature of ["a", "b", "c", "a"]) {
      alerts.notify({ ...report, signature });
    }
    await alerts.flush();
    expect(deliver).toHaveBeenCalledTimes(4);
  });

  it("reports delivery failures instead of throwing", async () => {
    const reportFailure = vi.fn();
    const alerts = createClientErrorAlerts({
      deliver: async () => {
        throw new Error("webhook down");
      },
      reportFailure,
    });
    expect(() => alerts.notify(report)).not.toThrow();
    await alerts.flush();
    expect(reportFailure).toHaveBeenCalledOnce();
  });

  it("posts to Discord without allowing mentions", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    await postDiscordWebhook({
      url: "https://discord.test/hook",
      content: "@everyone x".repeat(500),
      fetcher: fetcher as unknown as typeof fetch,
    });
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as {
      content: string;
      allowed_mentions: { parse: string[] };
    };
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.content).toHaveLength(2000);
  });

  it("fails when Discord refuses the webhook", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }));
    await expect(
      postDiscordWebhook({
        url: "https://discord.test/hook",
        content: "x",
        fetcher: fetcher as unknown as typeof fetch,
      }),
    ).rejects.toThrow("404");
  });
});
