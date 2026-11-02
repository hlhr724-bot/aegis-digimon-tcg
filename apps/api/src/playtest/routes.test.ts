import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AccountNotification, PlaytestMembership } from "@aegis/shared";
import { AccountStore } from "../accounts/AccountStore.js";
import { installAccountRoutes } from "../accounts/routes.js";
import { createMemoryPool } from "../db/memoryPool.fixture.js";
import { validateStudy } from "./routes.js";

type Harness = { store: AccountStore; url: string; player: string; admin: string; close: () => Promise<void> };
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
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    player: await cookieFor(store, "player", "Kai"),
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

const STUDY = {
  title: "Deck builder interviews",
  blurb: "Thirty minutes on a call.",
  link: "https://cal.example/aegis",
  closesAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
};

describe("/account/playtest", () => {
  it("requires a session", async () => {
    expect((await call("GET", "/account/playtest")).status).toBe(401);
    expect((await call("PUT", "/account/playtest", undefined, { member: true })).status).toBe(401);
  });

  it("turns membership on and off", async () => {
    expect(await (await call("GET", "/account/playtest", harness.player)).json()).toEqual({
      member: false,
      since: null,
    });
    const on = (await (
      await call("PUT", "/account/playtest", harness.player, { member: true })
    ).json()) as PlaytestMembership;
    expect(on.member).toBe(true);
    expect(typeof on.since).toBe("number");
    expect(await (await call("PUT", "/account/playtest", harness.player, { member: false })).json()).toEqual({
      member: false,
      since: null,
    });
  });

  it("rejects a body without a boolean", async () => {
    const response = await call("PUT", "/account/playtest", harness.player, { member: "yes" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_member" });
  });
});

describe("/admin/playtest", () => {
  it("is admin only", async () => {
    expect((await call("GET", "/admin/playtest/members", harness.player)).status).toBe(403);
    expect((await call("POST", "/admin/playtest/studies", harness.player, STUDY)).status).toBe(403);
    expect((await call("GET", "/account/admin/playtest/studies")).status).toBe(401);
  });

  it("lists members and opens a study that reaches them", async () => {
    await call("PUT", "/account/playtest", harness.player, { member: true });
    const members = (await (await call("GET", "/admin/playtest/members", harness.admin)).json()) as {
      members: { displayName: string }[];
    };
    expect(members.members.map((member) => member.displayName)).toEqual(["Kai"]);

    const created = await call("POST", "/admin/playtest/studies", harness.admin, STUDY);
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ notified: 1, study: { title: STUDY.title } });

    const inbox = (await (await call("GET", "/account/notifications", harness.player)).json()) as {
      items: AccountNotification[];
    };
    expect(inbox.items.map((item) => item.kind)).toEqual(["playtest_study"]);

    const studies = (await (await call("GET", "/account/admin/playtest/studies", harness.admin)).json()) as {
      open: { title: string }[];
      past: unknown[];
    };
    expect(studies.open.map((study) => study.title)).toEqual([STUDY.title]);
    expect(studies.past).toEqual([]);
  });

  it("refuses a study with a bad window, title, blurb or link", async () => {
    for (const [body, error] of [
      [{ ...STUDY, closesAt: Date.now() - 1 }, "invalid_window"],
      [{ ...STUDY, closesAt: 1e308 }, "invalid_window"],
      [{ ...STUDY, opensAt: STUDY.closesAt + 1 }, "invalid_window"],
      [{ ...STUDY, opensAt: Date.now() + 60_000 }, "invalid_window"],
      [{ ...STUDY, title: "" }, "invalid_title"],
      [{ ...STUDY, blurb: "x".repeat(601) }, "invalid_blurb"],
      [{ ...STUDY, link: "http://insecure.example" }, "invalid_link"],
      [{ ...STUDY, link: "javascript:alert(1)" }, "invalid_link"],
    ] as const) {
      const response = await call("POST", "/admin/playtest/studies", harness.admin, body);
      expect([JSON.stringify(body), response.status]).toEqual([JSON.stringify(body), 400]);
      expect(await response.json()).toEqual({ error });
    }
    const studies = (await (await call("GET", "/admin/playtest/studies", harness.admin)).json()) as {
      open: unknown[];
      past: unknown[];
    };
    expect(studies).toEqual({ open: [], past: [] });
  });
});

describe("validateStudy", () => {
  it("defaults opensAt to now and trims text", () => {
    const result = validateStudy({ ...STUDY, title: "  Interviews  " }, 1_000);
    expect(result).toMatchObject({ title: "Interviews", opensAt: 1_000, closesAt: STUDY.closesAt });
  });
});
