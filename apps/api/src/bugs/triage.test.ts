import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AccountNotification, OwnFeedbackReport } from "@aegis/shared";
import { AccountStore } from "../accounts/AccountStore.js";
import { installAccountRoutes } from "../accounts/routes.js";
import { createMemoryPool } from "../db/memoryPool.fixture.js";
import { FeedbackStore, type FeedbackDetail, type FeedbackListPage } from "./FeedbackStore.js";

type Harness = {
  store: AccountStore;
  feedback: FeedbackStore;
  url: string;
  reporter: string;
  stranger: string;
  admin: string;
  close: () => Promise<void>;
};

let harness: Harness;

async function cookieFor(store: AccountStore, subject: string, name: string, isAdmin = false): Promise<string> {
  const account = await store.accountForIdentity("discord", subject, name);
  if (isAdmin) await store.pool.query("UPDATE accounts SET roles=ARRAY['admin'] WHERE id=$1", [account.id]);
  return `aegis_session=${(await store.issueSession(account)).id}`;
}

beforeEach(async () => {
  const store = new AccountStore(createMemoryPool());
  const app = express();
  app.use(express.json());
  installAccountRoutes(app, store);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  harness = {
    store,
    feedback: new FeedbackStore(store),
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    reporter: await cookieFor(store, "reporter", "Kai"),
    stranger: await cookieFor(store, "stranger", "Mika"),
    admin: await cookieFor(store, "admin", "Vn", true),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
});

afterEach(async () => {
  await harness.close();
  await harness.store.close();
});

function call(method: string, path: string, cookie?: string, body?: unknown): Promise<Response> {
  return fetch(`${harness.url}${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function report(summary: string, cookie?: string, extra: Record<string, unknown> = {}): Promise<number> {
  const response = await call("POST", "/bug-reports", cookie, { summary, description: `${summary} details`, ...extra });
  expect(response.status).toBe(201);
  return (await json<{ number: number }>(response)).number;
}

function triage(id: number, body: Record<string, unknown>, cookie = harness.admin): Promise<Response> {
  return call("PATCH", `/admin/feedback/${id}`, cookie, { revision: 0, finalReply: "", internalNote: "", ...body });
}

async function notifications(cookie = harness.reporter) {
  return json<{ items: AccountNotification[]; unread: number; nextBefore: number | null }>(
    await call("GET", "/notifications", cookie),
  );
}

describe("admin feedback triage", () => {
  it("refuses guests and players on every admin endpoint", async () => {
    const id = await report("private", harness.reporter);
    for (const [method, path] of [
      ["GET", "/admin/feedback"],
      ["GET", `/admin/feedback/${id}`],
      ["PATCH", `/admin/feedback/${id}`],
    ] as const) {
      const body = method === "PATCH" ? { status: "triaged", revision: 0 } : undefined;
      expect((await call(method, path, undefined, body)).status).toBe(401);
      expect((await call(method, path, harness.reporter, body)).status).toBe(403);
    }
  });

  it("filters by status, kind and search while counting every status in scope", async () => {
    const psychemon = await report("Psychemon triggers twice", harness.reporter, { cardIds: ["BT8-071"] });
    await report("Show trash count", harness.reporter, { kind: "improvement" });
    await report("Kapurimon effect", undefined);
    expect((await triage(psychemon, { status: "triaged" })).status).toBe(200);

    const all = await json<FeedbackListPage>(await call("GET", "/admin/feedback", harness.admin));
    expect(all.items.map((item) => item.id)).toEqual([3, 2, 1]);
    expect(all.counts).toMatchObject({ new: 2, triaged: 1, resolved: 0 });

    const triaged = await json<FeedbackListPage>(await call("GET", "/admin/feedback?status=triaged", harness.admin));
    expect(triaged.items.map((item) => item.id)).toEqual([psychemon]);
    expect(triaged.counts).toEqual(all.counts);

    const improvements = await json<FeedbackListPage>(
      await call("GET", "/admin/feedback?kind=improvement", harness.admin),
    );
    expect(improvements.items.map((item) => item.report.summary)).toEqual(["Show trash count"]);
    expect(improvements.counts).toMatchObject({ new: 1, triaged: 0 });

    const byCard = await json<FeedbackListPage>(await call("GET", "/admin/feedback?q=bt8-071", harness.admin));
    expect(byCard.items.map((item) => item.id)).toEqual([psychemon]);
    const byId = await json<FeedbackListPage>(await call("GET", "/admin/feedback?q=%233", harness.admin));
    expect(byId.items.map((item) => item.id)).toEqual([3]);
    const literal = await json<FeedbackListPage>(await call("GET", "/admin/feedback?q=%25", harness.admin));
    expect(literal.items).toEqual([]);

    expect((await call("GET", "/admin/feedback?status=open", harness.admin)).status).toBe(400);
    expect((await call("GET", "/admin/feedback?kind=question", harness.admin)).status).toBe(400);
  });

  it("keeps the first inbox address working", async () => {
    await report("legacy", harness.reporter);
    const page = await json<FeedbackListPage>(await call("GET", "/account/feedback", harness.admin));
    expect(page.items[0]).toMatchObject({ status: "new", revision: 0, hasReporterAccount: true });
  });

  it("validates a triage edit before saving it", async () => {
    const id = await report("broken", harness.reporter);
    const cases: [Record<string, unknown>, string][] = [
      [{ status: "closed" }, "invalid_status"],
      [{ status: "triaged", revision: -1 }, "invalid_revision"],
      [{ status: "resolved" }, "final_reply_required"],
      [{ status: "wont_fix", finalReply: "   " }, "final_reply_required"],
      [{ status: "resolved", finalReply: "x".repeat(2001) }, "final_reply_too_long"],
      [{ status: "triaged", internalNote: "x".repeat(2001) }, "internal_note_too_long"],
      [{ status: "duplicate", finalReply: "dup" }, "duplicate_target_required"],
      [{ status: "duplicate", finalReply: "dup", duplicateOfId: id }, "invalid_duplicate_target"],
      [{ status: "duplicate", finalReply: "dup", duplicateOfId: 999 }, "invalid_duplicate_target"],
    ];
    for (const [body, error] of cases) {
      const response = await triage(id, body);
      expect([body, response.status, await response.json()]).toEqual([body, 400, { error }]);
    }
    const detail = await json<FeedbackDetail>(await call("GET", `/admin/feedback/${id}`, harness.admin));
    expect(detail).toMatchObject({ status: "new", revision: 0, finalReply: null });
    expect((await triage(404, { status: "triaged" })).status).toBe(404);
  });

  it("records each status change with its actor", async () => {
    const id = await report("broken", harness.reporter);
    await triage(id, { status: "triaged" });
    const saved = await json<FeedbackDetail>(
      await triage(id, { status: "in_progress", revision: 1, internalNote: " repro on BT8-071 " }),
    );
    expect(saved).toMatchObject({ status: "in_progress", revision: 2, internalNote: "repro on BT8-071" });
    expect(saved.history.map(({ from, to, actorName }) => [from, to, actorName])).toEqual([
      [null, "new", null],
      ["new", "triaged", "Vn"],
      ["triaged", "in_progress", "Vn"],
    ]);
  });

  it("refuses a stale revision and returns the current state", async () => {
    const id = await report("broken", harness.reporter);
    expect((await triage(id, { status: "triaged" })).status).toBe(200);
    const conflict = await triage(id, { status: "resolved", finalReply: "fixed" });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      error: "stale_revision",
      current: { status: "triaged", revision: 1 },
    });
  });

  it("links a duplicate to its original", async () => {
    const original = await report("original", harness.reporter);
    const copy = await report("copy", harness.reporter);
    const saved = await json<FeedbackDetail>(
      await triage(copy, {
        status: "duplicate",
        finalReply: "Tracked in the other report.",
        duplicateOfId: `${original}`,
      }),
    );
    expect(saved).toMatchObject({ status: "duplicate", duplicateOfId: original });
    const reopened = await json<FeedbackDetail>(
      await triage(copy, { status: "triaged", revision: 1, duplicateOfId: original }),
    );
    expect(reopened.duplicateOfId).toBeNull();
  });
});

describe("reporter notifications", () => {
  it("notifies the reporter of a status change and replaces their older unread update", async () => {
    const id = await report("Psychemon triggers twice", harness.reporter);
    await triage(id, { status: "in_progress" });
    expect(await json(await call("GET", "/notifications/unread-count", harness.reporter))).toEqual({ unread: 1 });

    await triage(id, { status: "resolved", revision: 1, finalReply: "Fixed in 1.19. Thanks!" });
    const inbox = await notifications();
    expect(inbox.unread).toBe(1);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({
      kind: "feedback_update",
      readAt: null,
      payload: {
        feedbackId: id,
        summary: "Psychemon triggers twice",
        status: "resolved",
        previousStatus: "in_progress",
        replyExcerpt: "Fixed in 1.19. Thanks!",
      },
    });
  });

  it("notifies when a closed report's reply changes, but not for internal notes", async () => {
    const id = await report("broken", harness.reporter);
    await triage(id, { status: "resolved", finalReply: "Fixed." });
    await call("POST", "/notifications/read", harness.reporter, { all: true });

    await triage(id, { status: "resolved", revision: 1, finalReply: "Fixed.", internalNote: "checked" });
    expect((await notifications()).unread).toBe(0);

    await triage(id, { status: "resolved", revision: 2, finalReply: "Fixed in 1.19." });
    const inbox = await notifications();
    expect(inbox.unread).toBe(1);
    expect(inbox.items.map((item) => item.readAt === null)).toEqual([true, false]);
  });

  it("does not notify anyone about an anonymous report", async () => {
    const id = await report("anonymous");
    const saved = await json<FeedbackDetail>(await triage(id, { status: "triaged" }));
    expect(saved.hasReporterAccount).toBe(false);
    const { rows } = await harness.store.pool.query("SELECT count(*) AS count FROM notifications");
    expect(Number(rows[0].count)).toBe(0);
  });

  it("marks only the caller's own notifications as read", async () => {
    const mine = await report("mine", harness.reporter);
    const theirs = await report("theirs", harness.stranger);
    await triage(mine, { status: "triaged" });
    await triage(theirs, { status: "triaged" });
    const strangerNotification = (await notifications(harness.stranger)).items[0]!;

    const response = await call("POST", "/notifications/read", harness.reporter, { ids: [strangerNotification.id] });
    expect(await response.json()).toEqual({ unread: 1 });
    expect((await notifications(harness.stranger)).unread).toBe(1);

    const own = (await notifications()).items[0]!;
    expect(await json(await call("POST", "/notifications/read", harness.reporter, { ids: [own.id] }))).toEqual({
      unread: 0,
    });
    expect((await call("POST", "/notifications/read", harness.reporter, { ids: ["x"] })).status).toBe(400);
    expect((await call("POST", "/notifications/read", harness.reporter, {})).status).toBe(400);
  });

  it("requires a session for the inbox", async () => {
    expect((await call("GET", "/notifications")).status).toBe(401);
    expect((await call("GET", "/notifications/unread-count")).status).toBe(401);
    expect((await call("POST", "/notifications/read", undefined, { all: true })).status).toBe(401);
  });
});

describe("reporter's own feedback", () => {
  it("shows the reply only once closed and never the internal note", async () => {
    const id = await report("broken", harness.reporter, { cardIds: ["BT8-071"] });
    await triage(id, { status: "in_progress", finalReply: "draft reply", internalNote: "secret" });

    const open = await json<OwnFeedbackReport>(await call("GET", `/feedback/mine/${id}`, harness.reporter));
    expect(open).toMatchObject({ status: "in_progress", finalReply: null, cardIds: ["BT8-071"] });
    expect(JSON.stringify(open)).not.toContain("secret");

    await triage(id, { status: "resolved", revision: 1, finalReply: "Fixed.", internalNote: "secret" });
    const closed = await json<OwnFeedbackReport>(await call("GET", `/feedback/mine/${id}`, harness.reporter));
    expect(closed.finalReply).toBe("Fixed.");
    expect(closed.history.map(({ from, to }) => [from, to])).toEqual([
      [null, "new"],
      ["new", "in_progress"],
      ["in_progress", "resolved"],
    ]);
    expect(JSON.stringify(closed)).not.toMatch(/secret|Vn/);
  });

  it("lists only the caller's reports and hides others behind 404", async () => {
    const mine = await report("mine", harness.reporter);
    const theirs = await report("theirs", harness.stranger);
    await report("anonymous");
    const page = await json<{ items: OwnFeedbackReport[] }>(await call("GET", "/feedback/mine", harness.reporter));
    expect(page.items.map((item) => item.id)).toEqual([mine]);
    expect((await call("GET", `/feedback/mine/${theirs}`, harness.reporter)).status).toBe(404);
    expect((await call("GET", "/feedback/mine/abc", harness.reporter)).status).toBe(404);
    expect((await call("GET", "/feedback/mine")).status).toBe(401);
  });

  it("serves the reporter's feedback under /account, the prefix the production gateway forwards", async () => {
    const mine = await report("mine", harness.reporter);
    const page = await json<{ items: OwnFeedbackReport[] }>(
      await call("GET", "/account/feedback/mine", harness.reporter),
    );
    expect(page.items.map((item) => item.id)).toEqual([mine]);
    expect((await call("GET", `/account/feedback/mine/${mine}`, harness.reporter)).status).toBe(200);
    expect((await call("GET", "/account/feedback/mine")).status).toBe(401);
  });
});

describe("confirmed bug points", () => {
  async function points(cookie = harness.reporter): Promise<number> {
    return (await json<{ confirmedBugs: number }>(await call("GET", "/feedback/mine", cookie))).confirmedBugs;
  }

  it("gives the reporter one point per confirmed report and takes it back when unconfirmed", async () => {
    const first = await report("first", harness.reporter);
    const second = await report("second", harness.reporter);
    expect(await points()).toBe(0);

    await triage(first, { status: "triaged", confirmedBug: true });
    await triage(second, { status: "resolved", finalReply: "Fixed.", confirmedBug: true });
    expect(await points()).toBe(2);
    const detail = await json<FeedbackDetail>(await call("GET", `/admin/feedback/${first}`, harness.admin));
    expect(detail).toMatchObject({ confirmedBug: true, reporterConfirmedBugs: 2 });

    await triage(first, { status: "triaged", revision: 1, confirmedBug: false });
    expect(await points()).toBe(1);
    const own = await json<OwnFeedbackReport>(await call("GET", `/feedback/mine/${second}`, harness.reporter));
    expect(own.confirmedBug).toBe(true);
  });

  it("keeps the judgment when an edit leaves it out", async () => {
    const id = await report("broken", harness.reporter);
    await triage(id, { status: "triaged", confirmedBug: true });
    const response = await call("PATCH", `/admin/feedback/${id}`, harness.admin, {
      revision: 1,
      status: "in_progress",
      finalReply: "",
      internalNote: "",
    });
    expect((await json<FeedbackDetail>(response)).confirmedBug).toBe(true);
    expect(await points()).toBe(1);
  });

  it("never counts a duplicate, so marking one as duplicate returns its point", async () => {
    const original = await report("original", harness.reporter);
    const copy = await report("copy", harness.reporter);
    await triage(copy, { status: "triaged", confirmedBug: true });
    expect(await points()).toBe(1);
    const saved = await json<FeedbackDetail>(
      await triage(copy, {
        status: "duplicate",
        revision: 1,
        finalReply: "Tracked elsewhere.",
        duplicateOfId: original,
        confirmedBug: true,
      }),
    );
    expect(saved.confirmedBug).toBe(false);
    expect(await points()).toBe(0);
  });

  it("tells the reporter about the point, even without a status change", async () => {
    const id = await report("broken", harness.reporter);
    await triage(id, { status: "triaged" });
    await call("POST", "/notifications/read", harness.reporter, { all: true });
    await triage(id, { status: "triaged", revision: 1, confirmedBug: true });
    const inbox = await notifications();
    expect(inbox.unread).toBe(1);
    expect(inbox.items[0]!.payload).toMatchObject({ status: "triaged", previousStatus: "triaged", bugConfirmed: true });
  });

  it("confirms an anonymous report without crediting anyone", async () => {
    const id = await report("anonymous");
    const saved = await json<FeedbackDetail>(await triage(id, { status: "triaged", confirmedBug: true }));
    expect(saved).toMatchObject({ confirmedBug: true, reporterConfirmedBugs: null });
    const { rows } = await harness.store.pool.query("SELECT sum(confirmed_bug_reports) AS total FROM accounts");
    expect(Number(rows[0].total)).toBe(0);
  });
});

describe("reporter reopens a closed report", () => {
  function reopen(id: number, comment: unknown, cookie = harness.reporter): Promise<Response> {
    return call("POST", `/feedback/mine/${id}/reopen`, cookie, { comment });
  }

  async function resolved(summary = "broken"): Promise<number> {
    const id = await report(summary, harness.reporter);
    expect((await triage(id, { status: "resolved", finalReply: "Fixed." })).status).toBe(200);
    return id;
  }

  it("sends the report back to triage with the reporter's comment", async () => {
    const id = await resolved();
    const before = await json<OwnFeedbackReport>(await call("GET", `/feedback/mine/${id}`, harness.reporter));
    expect(before.reopenDeadline).toBeGreaterThan(Date.now());

    const response = await reopen(id, "  Still triggers twice after the update.  ");
    expect(response.status).toBe(200);
    const reopened = await json<OwnFeedbackReport>(response);
    expect(reopened).toMatchObject({ status: "triaged", finalReply: "Fixed.", reopenDeadline: null });
    expect(reopened.history.at(-1)).toMatchObject({
      from: "resolved",
      to: "triaged",
      byReporter: true,
      comment: "Still triggers twice after the update.",
    });

    const detail = await json<FeedbackDetail>(await call("GET", `/admin/feedback/${id}`, harness.admin));
    expect(detail.reopenedAt).not.toBeNull();
    expect(detail.history.at(-1)).toMatchObject({ byReporter: true, actorName: "Kai" });
    const inbox = await json<FeedbackListPage>(await call("GET", "/admin/feedback?reopened=1", harness.admin));
    expect(inbox.items.map((item) => item.id)).toEqual([id]);
    expect(inbox.reopenedCount).toBe(1);
  });

  it("allows one reopen per report and stops counting it once closed again", async () => {
    const id = await resolved();
    expect((await reopen(id, "Not fixed")).status).toBe(200);
    await triage(id, { status: "resolved", revision: 2, finalReply: "Fixed for real this time." });

    const second = await reopen(id, "Still not fixed");
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "already_reopened" });
    const inbox = await json<FeedbackListPage>(await call("GET", "/admin/feedback", harness.admin));
    expect(inbox.reopenedCount).toBe(0);
    const own = await json<OwnFeedbackReport>(await call("GET", `/feedback/mine/${id}`, harness.reporter));
    expect(own.reopenDeadline).toBeNull();
  });

  it("refuses open reports, expired windows and other people's reports", async () => {
    const open = await report("open", harness.reporter);
    expect(await json(await reopen(open, "why"))).toEqual({ error: "not_closed" });

    const expired = await resolved("old");
    await harness.store.pool.query("UPDATE feedback_reports SET closed_at=$1 WHERE id=$2", [
      Date.now() - 31 * 24 * 60 * 60 * 1000,
      expired,
    ]);
    const late = await reopen(expired, "late");
    expect(late.status).toBe(409);
    expect(await late.json()).toEqual({ error: "reopen_window_closed" });

    const mine = await resolved("mine");
    expect((await reopen(mine, "not yours", harness.stranger)).status).toBe(404);
    expect((await reopen(mine, "guest", "")).status).toBe(401);
  });

  it("requires a comment within the length budget", async () => {
    const id = await resolved();
    for (const [comment, error] of [
      [undefined, "empty_comment"],
      ["   ", "empty_comment"],
      [42, "empty_comment"],
      ["x".repeat(1001), "comment_too_long"],
    ] as const) {
      const response = await reopen(id, comment);
      expect([comment, response.status, await response.json()]).toEqual([comment, 400, { error }]);
    }
    const own = await json<OwnFeedbackReport>(await call("GET", `/feedback/mine/${id}`, harness.reporter));
    expect(own.status).toBe("resolved");
  });

  it("keeps the reopen window anchored to the first closure", async () => {
    const closedAt = async (id: number) =>
      (await harness.store.pool.query("SELECT closed_at FROM feedback_reports WHERE id=$1", [id])).rows[0].closed_at;
    const id = await resolved();
    const first = await closedAt(id);
    expect(first).not.toBeNull();
    await triage(id, { status: "resolved", revision: 1, finalReply: "Fixed, with more detail." });
    expect(await closedAt(id)).toBe(first);
    await triage(id, { status: "in_progress", revision: 2 });
    expect(await closedAt(id)).toBeNull();
  });
});
