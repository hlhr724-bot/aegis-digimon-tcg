import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { FeedbackStore } from "#api/bugs/FeedbackStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { installRoadmapRoutes } from "#api/roadmap/installRoadmapRoutes";
import { RoadmapStore } from "#api/roadmap/RoadmapStore";
import { RoadmapStatus } from "@aegis/shared/roadmap/RoadmapStatus";
import type { RoadmapItem, RoadmapItemDetail } from "@aegis/shared/roadmap/roadmapTypes";

type Harness = {
  accounts: AccountStore;
  url: string;
  player: string;
  admin: string;
  close: () => Promise<void>;
};

let harness: Harness;

async function cookieFor({ accounts, name, isAdmin }: { accounts: AccountStore; name: string; isAdmin: boolean }) {
  const account = await accounts.accountForIdentity("discord", name, name);
  if (isAdmin) await accounts.pool.query("UPDATE accounts SET roles=ARRAY['admin'] WHERE id=$1", [account.id]);
  return `aegis_session=${(await accounts.issueSession(account)).id}`;
}

beforeEach(async () => {
  const accounts = new AccountStore(createMemoryPool());
  const app = express();
  app.use(express.json());
  installRoadmapRoutes({
    app,
    store: new RoadmapStore(accounts),
    session: (req) => accounts.session(/aegis_session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1]),
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  harness = {
    accounts,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    player: await cookieFor({ accounts, name: "player", isAdmin: false }),
    admin: await cookieFor({ accounts, name: "admin", isAdmin: true }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
});

afterEach(async () => {
  await harness.close();
  await harness.accounts.close();
});

function call(
  path: string,
  { method = "GET", cookie, body }: { method?: string; cookie?: string; body?: unknown } = {},
) {
  return fetch(`${harness.url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const draft = {
  title: "Tournament brackets",
  description: "Show the full bracket while a tournament runs.",
  status: RoadmapStatus.PLANNED.value,
  discussionUrl: "https://discord.com/channels/1/2/3",
};

describe("the public roadmap", () => {
  it("starts with Ranked planned and its description, and nothing under review", async () => {
    const { items } = (await (await call("/community/roadmap")).json()) as { items: RoadmapItem[] };
    expect(items).toEqual([
      expect.objectContaining({
        title: "Ranked / Leaderboard",
        status: RoadmapStatus.PLANNED.value,
        description: expect.stringContaining("seasonal leaderboard"),
      }),
    ]);
  });

  it("lets a signed-in player support an item once and take the support back", async () => {
    const { items } = (await (await call("/community/roadmap")).json()) as { items: RoadmapItem[] };
    const target = items.at(-1)!;
    for (let attempt = 0; attempt < 2; attempt++) {
      const supported = await call(`/community/roadmap/${target.id}/support`, {
        method: "PUT",
        cookie: harness.player,
        body: { supported: true },
      });
      expect(await supported.json()).toMatchObject({ id: target.id, supportCount: 1, supported: true });
    }
    const board = (await (await call("/community/roadmap", { cookie: harness.player })).json()) as {
      items: RoadmapItem[];
    };
    expect(board.items[0]).toMatchObject({ id: target.id, supportCount: 1, supported: true });
    const anonymous = (await (await call(`/community/roadmap/${target.id}`)).json()) as RoadmapItemDetail;
    expect(anonymous).toMatchObject({ supportCount: 1, supported: false });
    const withdrawn = await call(`/community/roadmap/${target.id}/support`, {
      method: "PUT",
      cookie: harness.player,
      body: { supported: false },
    });
    expect(await withdrawn.json()).toMatchObject({ supportCount: 0, supported: false });
  });

  it("asks guests to sign in before supporting", async () => {
    const response = await call("/community/roadmap/1/support", { method: "PUT", body: { supported: true } });
    expect(response.status).toBe(401);
  });

  it("keeps serving the board at the legacy /roadmap path", async () => {
    const legacy = (await (await call("/roadmap")).json()) as { items: RoadmapItem[] };
    const current = (await (await call("/community/roadmap")).json()) as { items: RoadmapItem[] };
    expect(legacy).toEqual(current);
  });

  it("answers 404 for an item that does not exist", async () => {
    expect((await call("/community/roadmap/999")).status).toBe(404);
    expect(
      (
        await call("/community/roadmap/999/support", {
          method: "PUT",
          cookie: harness.player,
          body: { supported: true },
        })
      ).status,
    ).toBe(404);
  });
});

describe("admin roadmap management", () => {
  it("refuses players", async () => {
    expect((await call("/admin/roadmap", { method: "POST", cookie: harness.player, body: draft })).status).toBe(403);
    expect((await call("/admin/roadmap/1", { method: "DELETE", cookie: harness.player })).status).toBe(403);
  });

  it("publishes, edits and removes an item", async () => {
    const created = await call("/admin/roadmap", { method: "POST", cookie: harness.admin, body: draft });
    expect(created.status).toBe(201);
    const item = (await created.json()) as RoadmapItemDetail;
    expect(item).toMatchObject({ ...draft, supportCount: 0 });

    const updated = await call(`/admin/roadmap/${item.id}`, {
      method: "PUT",
      cookie: harness.admin,
      body: { ...draft, status: RoadmapStatus.COMPLETED.value, discussionUrl: null },
    });
    expect(await updated.json()).toMatchObject({ status: "completed", discussionUrl: null });

    expect((await call(`/admin/roadmap/${item.id}`, { method: "DELETE", cookie: harness.admin })).status).toBe(204);
    expect((await call(`/roadmap/${item.id}`)).status).toBe(404);
  });

  it.each([
    [{ ...draft, status: "new" }, "invalid_status"],
    [{ ...draft, title: "  " }, "empty_title"],
    [{ ...draft, description: "" }, "empty_description"],
    [{ ...draft, discussionUrl: "https://example.com/thread" }, "invalid_discussion_url"],
    [{ ...draft, discussionUrl: 7 }, "invalid_discussion_url"],
  ])("rejects an invalid draft (%o)", async (body, error) => {
    const response = await call("/admin/roadmap", { method: "POST", cookie: harness.admin, body });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
  });

  it("publishes a private report once and finds the item from the report", async () => {
    const feedbackId = await new FeedbackStore(harness.accounts).save(
      { kind: "improvement", summary: "Bracket view", description: "Private words", cardIds: [] },
      undefined,
      false,
    );
    expect(await (await call(`/admin/feedback/${feedbackId}/roadmap`, { cookie: harness.admin })).json()).toEqual({
      item: null,
    });

    const body = { ...draft, sourceFeedbackId: feedbackId };
    const created = (await (
      await call("/admin/roadmap", { method: "POST", cookie: harness.admin, body })
    ).json()) as RoadmapItemDetail;
    const linked = (await (await call(`/admin/feedback/${feedbackId}/roadmap`, { cookie: harness.admin })).json()) as {
      item: RoadmapItemDetail;
    };
    expect(linked.item.id).toBe(created.id);
    expect(linked.item.description).toBe(draft.description);

    const again = await call("/admin/roadmap", { method: "POST", cookie: harness.admin, body });
    expect(again.status).toBe(409);
    expect(
      (
        await call("/admin/roadmap", {
          method: "POST",
          cookie: harness.admin,
          body: { ...draft, sourceFeedbackId: 999 },
        })
      ).status,
    ).toBe(404);
  });
});
