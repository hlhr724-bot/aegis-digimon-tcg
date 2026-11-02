import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackStore } from "./FeedbackStore.js";
import { AccountStore } from "../accounts/AccountStore.js";
import { installAccountRoutes } from "../accounts/routes.js";
import { createMemoryPool } from "../db/memoryPool.fixture.js";
import {
  MAX_BUG_REPORT_DESCRIPTION,
  MAX_BUG_REPORT_SUMMARY,
  type IssueTracker,
  type NewBugReport,
} from "./GitHubIssueTracker.js";

type Harness = {
  store: AccountStore;
  url: string;
  cookie: string;
  filed: NewBugReport[];
  close: () => Promise<void>;
};

let harness: Harness;

// The account routes capture a reported match's replay from the log directory; point them at an
// empty one so reports carrying a match ID never read a developer's real logs. Replay capture
// itself is covered in replayCapture.test.ts.
const previousLogDir = process.env.AEGIS_LOG_DIR;
let emptyLogDir: string;
beforeAll(() => {
  emptyLogDir = mkdtempSync(join(tmpdir(), "aegis-bug-routes-"));
  process.env.AEGIS_LOG_DIR = emptyLogDir;
});
afterAll(() => {
  if (previousLogDir === undefined) delete process.env.AEGIS_LOG_DIR;
  else process.env.AEGIS_LOG_DIR = previousLogDir;
  rmSync(emptyLogDir, { recursive: true, force: true });
});

async function startHarness(tracker?: IssueTracker, filed: NewBugReport[] = []): Promise<Harness> {
  const store = new AccountStore(createMemoryPool());
  const app = express();
  app.use(express.json());
  installAccountRoutes(
    app,
    store,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    tracker,
  );
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  const reporter = await store.accountForIdentity("discord", "reporter", "Tamer");
  const session = await store.issueSession(reporter);

  return {
    store,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    cookie: `aegis_session=${session.id}`,
    filed,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function recordingTracker(filed: NewBugReport[]): IssueTracker {
  return {
    file: async (report) => {
      filed.push(report);
      return { number: 42, url: "https://github.com/example/repo/issues/42" };
    },
  };
}

function submit(body: unknown, cookie?: string): Promise<Response> {
  return fetch(`${harness.url}/bug-reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  const filed: NewBugReport[] = [];
  harness = await startHarness(recordingTracker(filed), filed);
});

afterEach(async () => {
  await harness.close();
  await harness.store.close();
  vi.restoreAllMocks();
});

describe("submitting a bug report", () => {
  it("files an anonymous report, crediting no account", async () => {
    const response = await submit({ summary: "broken", description: "broken" });
    expect(response.status).toBe(201);
    expect(harness.filed[0]).toEqual({ kind: "bug", summary: "broken", cardIds: [], description: "broken" });
    expect(harness.filed[0]).not.toHaveProperty("reporterName");
  });

  // The anonymous budget is small on purpose: an address is all there is to meter by.
  it("meters anonymous reporters harder than accounts", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await submit({ summary: "broken", description: "broken" })).status).toBe(201);
    }
    const refused = await submit({ summary: "broken", description: "broken" });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: "too_many_requests" });

    // The account bucket is untouched by what an anonymous caller spent.
    expect((await submit({ summary: "broken", description: "broken" }, harness.cookie)).status).toBe(201);
  });

  it("files every field the reporter filled in", async () => {
    const response = await submit(
      {
        kind: "bug",
        summary: "  On-play never fires  ",
        cardIds: ["bt1-010"],
        description: "  Play it, nothing happens  ",
        opponentDeck: " Red Hybrid ",
        clientRevision: "abc123",
        userAgent: "Mozilla/5.0 (Macintosh)",
      },
      harness.cookie,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ number: 42, url: "https://github.com/example/repo/issues/42" });
    expect(harness.filed).toEqual([
      {
        reporterName: "Tamer",
        kind: "bug",
        summary: "On-play never fires",
        cardIds: ["BT1-010"],
        description: "Play it, nothing happens",
        opponentDeck: "Red Hybrid",
        clientRevision: "abc123",
        userAgent: "Mozilla/5.0 (Macintosh)",
      },
    ]);
  });

  it("carries a valid match ID into the issue tracker", async () => {
    const matchId = "f62249e5-ba6e-4528-b517-63bee8fbbb0f";
    const response = await submit({ summary: "broken", description: "broken", matchId: ` ${matchId} ` });
    expect(response.status).toBe(201);
    expect(harness.filed[0]).toHaveProperty("matchId", matchId);
  });

  it.each([undefined, null, 123, "", "room-123", "@everyone\n#42", "f62249e5-ba6e-4528-b517-63bee8fbbb0f extra"])(
    "ignores invalid optional match context (%s)",
    async (matchId) => {
      const response = await submit({ summary: "broken", description: "broken", matchId });
      expect(response.status).toBe(201);
      expect(harness.filed[0]).not.toHaveProperty("matchId");
    },
  );

  // Clients cached from before feedback kinds existed still send bare bug reports.
  it("files a report that names no kind as a bug", async () => {
    const response = await submit({ summary: "memory desyncs", description: "it desyncs" }, harness.cookie);
    expect(response.status).toBe(201);
    expect(harness.filed[0]).toEqual({
      reporterName: "Tamer",
      kind: "bug",
      summary: "memory desyncs",
      cardIds: [],
      description: "it desyncs",
    });
  });

  it("refuses a blank summary", async () => {
    const response = await submit({ summary: "  ", description: "broken" }, harness.cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "empty_summary" });
    expect(harness.filed).toHaveLength(0);
  });

  it("refuses a summary past the length budget", async () => {
    const response = await submit(
      { summary: "x".repeat(MAX_BUG_REPORT_SUMMARY + 1), description: "broken" },
      harness.cookie,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "summary_too_long" });
  });

  it("refuses a blank description", async () => {
    const response = await submit({ summary: "broken", cardIds: ["BT1-010"], description: "   " }, harness.cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "empty_description" });
    expect(harness.filed).toHaveLength(0);
  });

  it("refuses a description past the length budget", async () => {
    const response = await submit(
      { summary: "broken", description: "x".repeat(MAX_BUG_REPORT_DESCRIPTION + 1) },
      harness.cookie,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "description_too_long" });
  });

  it("refuses a card id that names no card", async () => {
    const response = await submit(
      { summary: "broken", cardIds: ["NOT-A-CARD"], description: "broken" },
      harness.cookie,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "unknown_card" });
  });

  it("refuses a kind it does not know", async () => {
    for (const kind of ["question", 3, ""]) {
      const response = await submit({ kind, summary: "broken", description: "broken" }, harness.cookie);
      expect([kind, response.status]).toEqual([kind, 400]);
      expect(await response.json()).toEqual({ error: "invalid_kind" });
    }
    expect(harness.filed).toHaveLength(0);
  });

  it("trims the context the client carries instead of refusing an odd one", async () => {
    await submit(
      { summary: "broken", description: "broken", clientRevision: "r".repeat(400), userAgent: "u".repeat(900) },
      harness.cookie,
    );
    expect(harness.filed[0]!.clientRevision).toHaveLength(60);
    expect(harness.filed[0]!.userAgent).toHaveLength(300);
  });

  it("keeps feedback when the GitHub copy fails", async () => {
    await harness.close();
    harness = await startHarness({
      file: () => Promise.reject(new Error("GitHub refused the issue: 403")),
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await submit({ summary: "broken", description: "broken" }, harness.cookie);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ number: 1 });
    expect((await new FeedbackStore(harness.store).list()).items[0]).toMatchObject({
      githubStatus: "failed",
      report: { summary: "broken" },
    });
    vi.restoreAllMocks();
  });

  it.each(["improvement", "other"])("keeps %s feedback private even when the GitHub tracker is on", async (kind) => {
    const response = await submit({ kind, summary: "an idea", description: "details" }, harness.cookie);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ number: 1 });
    expect(harness.filed).toEqual([]);
    expect((await new FeedbackStore(harness.store).list()).items[0]).toMatchObject({
      githubStatus: "disabled",
      report: { kind, summary: "an idea" },
    });
  });

  it("saves feedback without a GitHub tracker", async () => {
    await harness.close();
    harness = await startHarness(undefined);

    const response = await submit({ summary: "broken", description: "broken" }, harness.cookie);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ number: 1 });
    expect((await new FeedbackStore(harness.store).list()).items[0]?.githubStatus).toBe("disabled");
    const limits = (await (await fetch(`${harness.url}/bug-reports/limits`)).json()) as { enabled: boolean };
    expect(limits.enabled).toBe(true);
  });
});

describe("feedback persistence and administrator access", () => {
  async function adminCookie() {
    const admin = await harness.store.accountForIdentity("discord", "admin", "Vn");
    await harness.store.pool.query("UPDATE accounts SET roles=ARRAY['admin'] WHERE id=$1", [admin.id]);
    const session = await harness.store.issueSession(admin);
    return `aegis_session=${session.id}`;
  }

  function list(cookie?: string, query = "") {
    return fetch(`${harness.url}/account/feedback${query}`, {
      headers: cookie ? { Cookie: cookie } : {},
    });
  }

  it("saves anonymous and signed reports with their account and mirror context", async () => {
    await submit({ summary: "anonymous", description: "details" });
    await submit(
      { summary: "signed", description: "details", matchId: "f62249e5-ba6e-4528-b517-63bee8fbbb0f" },
      harness.cookie,
    );
    const response = await list(await adminCookie());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const page = await response.json();
    expect(page).toMatchObject({
      nextBefore: null,
      items: [
        {
          id: 2,
          report: { summary: "signed", reporterName: "Tamer", matchId: "f62249e5-ba6e-4528-b517-63bee8fbbb0f" },
          githubStatus: "sent",
          githubNumber: 42,
        },
        { id: 1, report: { summary: "anonymous" }, githubUrl: "https://github.com/example/repo/issues/42" },
      ],
    });
    const rows = (await harness.store.pool.query("SELECT reporter_account_id FROM feedback_reports ORDER BY id")).rows;
    expect(rows[0].reporter_account_id).toBeNull();
    expect(rows[1].reporter_account_id).toBeTruthy();
  });

  it("rejects guests and ordinary players, including a player named Vn", async () => {
    await submit({ summary: "private", description: "private" });
    expect((await list()).status).toBe(401);
    expect((await list(harness.cookie)).status).toBe(403);
    const impostor = await harness.store.accountForIdentity("discord", "impostor", "Vn");
    const session = await harness.store.issueSession(impostor);
    const response = await list(`aegis_session=${session.id}`);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "admin_required" });
  });

  it("rechecks the administrator permission on every read", async () => {
    const cookie = await adminCookie();
    expect((await list(cookie)).status).toBe(200);
    await harness.store.pool.query("UPDATE accounts SET roles=ARRAY[]::text[] WHERE display_name='Vn'");
    expect((await list(cookie)).status).toBe(403);
  });

  it("paginates by ID without repeating reports when new ones arrive", async () => {
    const store = new FeedbackStore(harness.store);
    for (let i = 0; i < 52; i++) {
      await store.save({ kind: "bug", summary: `Report ${i}`, description: "details", cardIds: [] }, undefined, false);
    }
    const cookie = await adminCookie();
    const first = (await (await list(cookie)).json()) as Awaited<ReturnType<FeedbackStore["list"]>>;
    expect(first.items).toHaveLength(50);
    expect(first.items[0]!.id).toBe(52);
    expect(first.nextBefore).toBe(3);
    await store.save({ kind: "other", summary: "new", description: "new", cardIds: [] }, undefined, false);
    const second = (await (await list(cookie, `?before=${first.nextBefore}`)).json()) as Awaited<
      ReturnType<FeedbackStore["list"]>
    >;
    expect(second.items.map((item: { id: number }) => item.id)).toEqual([2, 1]);
    expect(second.nextBefore).toBeNull();
  });

  it.each(["0", "-1", "abc", "1.5", "2147483648", "1&before=2", ""])("rejects invalid cursor %s", async (cursor) => {
    expect((await list(await adminCookie(), `?before=${cursor}`)).status).toBe(400);
  });

  it("does not call GitHub when database persistence fails", async () => {
    vi.spyOn(FeedbackStore.prototype, "save").mockRejectedValue(new Error("database offline"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await submit({ summary: "broken", description: "details" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "reports_unavailable" });
    expect(harness.filed).toHaveLength(0);
  });

  it("still acknowledges saved feedback when recording the mirror result fails", async () => {
    vi.spyOn(FeedbackStore.prototype, "recordMirror").mockRejectedValue(new Error("database offline"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await submit({ summary: "saved", description: "details" })).status).toBe(201);
    expect((await new FeedbackStore(harness.store).list()).items[0]?.githubStatus).toBe("pending");
  });
});
