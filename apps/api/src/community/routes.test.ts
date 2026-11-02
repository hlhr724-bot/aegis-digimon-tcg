import type { AddressInfo } from "node:net";
import {
  ALL_FAMOUS_DECKS,
  isFamousDeckAvailable,
  type CommunityDeck,
  type CommunityDeckPage,
  type CommunityDeckReport,
  type CommunityPublication,
  type ReportedCommunityDeck,
} from "@aegis/shared";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "../accounts/AccountStore.js";
import { installAccountRoutes } from "../accounts/routes.js";
import { createMemoryPool } from "../db/memoryPool.fixture.js";
import type { DeckReportTracker, NewDeckReport } from "./deckReports.js";

type Player = { id: string; cookie: string };
type Harness = { url: string; store: AccountStore; reports: NewDeckReport[]; close: () => Promise<void> };

const legalDecks = ALL_FAMOUS_DECKS.filter(isFamousDeckAvailable)
  .map((deck) => deck.decklist)
  .filter((list) => list.mainDeck.length === 50 && list.eggDeck.length <= 5);
const [redList, otherList] = legalDecks;

let harness: Harness;

/** `null` runs without a public copy, the default deployment. */
async function startHarness(override?: DeckReportTracker | null): Promise<Harness> {
  const store = new AccountStore(createMemoryPool());
  const reports: NewDeckReport[] = [];
  const app = express();
  app.use(express.json());
  const tracker =
    override === null
      ? undefined
      : (override ?? { report: async (report: NewDeckReport) => void reports.push(report) });
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
    undefined,
    undefined,
    tracker,
  );
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    store,
    reports,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function signIn(name: string, { admin = false } = {}): Promise<Player> {
  const account = await harness.store.accountForIdentity("discord", name, name);
  if (admin) await harness.store.pool.query("UPDATE accounts SET roles=ARRAY['admin'] WHERE id=$1", [account.id]);
  const session = await harness.store.issueSession(account);
  return { id: account.id, cookie: `aegis_session=${session.id}` };
}

async function call(path: string, method = "GET", player?: Player, body?: unknown): Promise<Response> {
  return fetch(`${harness.url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(player ? { Cookie: player.cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function saveAndPublish(player: Player, deckId: string, name: string, list = redList!) {
  await harness.store.saveDeck(player.id, {
    id: deckId,
    name,
    mainDeck: [...list.mainDeck],
    eggDeck: [...list.eggDeck],
  });
  const response = await call(`/community/publications/${deckId}`, "PUT", player);
  expect(response.status).toBe(200);
  return (await response.json()) as { id: string };
}

async function browse(query = "", player?: Player): Promise<CommunityDeckPage> {
  return (await call(`/community/decks${query}`, "GET", player)).json() as Promise<CommunityDeckPage>;
}

beforeEach(async () => {
  harness = await startHarness();
});

afterEach(async () => {
  await harness.close();
  await harness.store.close();
});

describe("publishing", () => {
  it("needs an account", async () => {
    expect((await call("/community/publications/custom-1", "PUT")).status).toBe(401);
  });

  it("publishes the saved deck, not the request body", async () => {
    const author = await signIn("Author");
    const { id } = await saveAndPublish(author, "custom-1", "Jesmon Blitz");
    const deck = (await (await call(`/community/decks/${id}`)).json()) as CommunityDeck;
    expect(deck).toMatchObject({ name: "Jesmon Blitz", author: { displayName: "Author" }, likeCount: 0, legal: true });
    expect(deck.mainDeck).toEqual(redList!.mainDeck);
  });

  it("refuses an illegal deck and a blocked name", async () => {
    const author = await signIn("Author");
    await harness.store.saveDeck(author.id, { id: "short", name: "Half", mainDeck: ["BT1-009"], eggDeck: [] });
    expect(await (await call("/community/publications/short", "PUT", author)).json()).toEqual({
      error: "deck_not_legal",
    });
    await harness.store.saveDeck(author.id, {
      id: "rude",
      name: "Muerte a la Royal Base",
      mainDeck: [...redList!.mainDeck],
      eggDeck: [...redList!.eggDeck],
    });
    const rude = await call("/community/publications/rude", "PUT", author);
    expect(rude.status).toBe(422);
    expect(await rude.json()).toEqual({ error: "name_not_allowed" });
    expect((await browse()).decks).toEqual([]);
  });

  it("returns 404 for a deck the caller does not own", async () => {
    const author = await signIn("Author");
    const other = await signIn("Other");
    await harness.store.saveDeck(author.id, {
      id: "custom-1",
      name: "Mine",
      mainDeck: [...redList!.mainDeck],
      eggDeck: [...redList!.eggDeck],
    });
    expect((await call("/community/publications/custom-1", "PUT", other)).status).toBe(404);
  });

  it("keeps one public copy per saved deck and marks it outdated after an edit", async () => {
    const author = await signIn("Author");
    const first = await saveAndPublish(author, "custom-1", "First name");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await harness.store.saveDeck(author.id, {
      id: "custom-1",
      name: "Second name",
      mainDeck: [...redList!.mainDeck],
      eggDeck: [...redList!.eggDeck],
    });
    const [publication] = (await (await call("/community/publications", "GET", author)).json()) as Array<{
      outdated: boolean;
      name: string;
    }>;
    expect(publication).toMatchObject({ name: "First name", outdated: true });
    const second = await saveAndPublish(author, "custom-1", "Second name");
    expect(second.id).toBe(first.id);
    expect((await browse()).decks.map((deck) => deck.name)).toEqual(["Second name"]);
  });

  it("hides an unpublished or deleted deck and keeps its likes for a republish", async () => {
    const author = await signIn("Author");
    const fan = await signIn("Fan");
    const { id } = await saveAndPublish(author, "custom-1", "Comeback");
    await call(`/community/decks/${id}/like`, "PUT", fan);
    expect((await call("/community/publications/custom-1", "DELETE", author)).status).toBe(204);
    expect((await call(`/community/decks/${id}`)).status).toBe(404);
    await saveAndPublish(author, "custom-1", "Comeback");
    expect((await browse()).decks[0]).toMatchObject({ id, likeCount: 1 });
    expect((await call("/account/decks/custom-1", "DELETE", author)).status).toBe(204);
    expect((await browse()).decks).toEqual([]);
  });
});

describe("likes", () => {
  it("counts one like per account and refuses the author's own", async () => {
    const author = await signIn("Author");
    const fan = await signIn("Fan");
    const { id } = await saveAndPublish(author, "custom-1", "Liked deck");
    expect((await call(`/community/decks/${id}/like`, "PUT")).status).toBe(401);
    expect((await call(`/community/decks/${id}/like`, "PUT", author)).status).toBe(403);
    expect(await (await call(`/community/decks/${id}/like`, "PUT", fan)).json()).toEqual({ liked: true, likeCount: 1 });
    expect(await (await call(`/community/decks/${id}/like`, "PUT", fan)).json()).toEqual({ liked: true, likeCount: 1 });
    expect((await browse("", fan)).decks[0]).toMatchObject({ likeCount: 1, likedByMe: true });
    expect((await browse("", author)).decks[0]).toMatchObject({ likedByMe: false });
    expect(await (await call(`/community/decks/${id}/like`, "DELETE", fan)).json()).toEqual({
      liked: false,
      likeCount: 0,
    });
  });

  it("returns 404 for an unknown deck", async () => {
    const fan = await signIn("Fan");
    expect((await call("/community/decks/not-a-uuid/like", "PUT", fan)).status).toBe(404);
    expect((await call("/community/decks/00000000-0000-0000-0000-000000000000/like", "PUT", fan)).status).toBe(404);
  });
});

describe("browsing", () => {
  it("ranks top by likes and new by publish time", async () => {
    const author = await signIn("Author");
    const fans = await Promise.all(["A", "B"].map((name) => signIn(name)));
    const older = await saveAndPublish(author, "older", "Older deck");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveAndPublish(author, "newer", "Newer deck");
    for (const fan of fans) await call(`/community/decks/${older.id}/like`, "PUT", fan);
    expect((await browse("?sort=top&period=week")).decks.map((deck) => deck.name)).toEqual([
      "Older deck",
      "Newer deck",
    ]);
    expect((await browse("?sort=top&period=all")).decks.map((deck) => deck.name)).toEqual(["Older deck", "Newer deck"]);
    expect((await browse("?sort=new")).decks.map((deck) => deck.name)).toEqual(["Newer deck", "Older deck"]);
  });

  it("filters by name, author and color", async () => {
    const author = await signIn("Gotsumon");
    await saveAndPublish(author, "one", "Jesmon Blitz", redList);
    await saveAndPublish(author, "two", "Something else", otherList);
    expect((await browse("?q=jesmon")).decks.map((deck) => deck.name)).toEqual(["Jesmon Blitz"]);
    expect((await browse("?q=gotsu")).decks).toHaveLength(2);
    expect((await browse("?q=100%25")).decks).toEqual([]);
    const [color] = (await browse("?q=jesmon")).decks[0]!.colors;
    const byColor = await browse(`?colors=${color}`);
    expect(byColor.decks.every((deck) => deck.colors.includes(color!))).toBe(true);
    expect(byColor.decks.map((deck) => deck.name)).toContain("Jesmon Blitz");
  });
});

describe("copies", () => {
  it("counts one copy per account", async () => {
    const author = await signIn("Author");
    const fan = await signIn("Fan");
    const { id } = await saveAndPublish(author, "custom-1", "Copied deck");
    expect((await call(`/community/decks/${id}/copies`, "POST")).status).toBe(401);
    expect((await call(`/community/decks/${id}/copies`, "POST", fan)).status).toBe(204);
    expect((await call(`/community/decks/${id}/copies`, "POST", fan)).status).toBe(204);
    expect((await browse()).decks[0]).toMatchObject({ copyCount: 1 });
  });
});

describe("reports", () => {
  it("files the deck, its author and the reason, but never the reporter", async () => {
    const author = await signIn("Author");
    const reporter = await signIn("Reporter");
    const { id } = await saveAndPublish(author, "custom-1", "Reported deck");
    const response = await call(`/community/decks/${id}/reports`, "POST", reporter, {
      reason: "offensive_name",
      details: "  rude name  ",
    });
    expect(response.status).toBe(204);
    expect(harness.reports).toEqual([
      { deckId: id, deckName: "Reported deck", authorName: "Author", reason: "offensive_name", details: "rude name" },
    ]);
  });

  it("refuses guests, the author, unknown decks and malformed reports", async () => {
    const author = await signIn("Author");
    const reporter = await signIn("Reporter");
    const { id } = await saveAndPublish(author, "custom-1", "Reported deck");
    const report = (player: Player | undefined, body: unknown, deckId = id) =>
      call(`/community/decks/${deckId}/reports`, "POST", player, body);
    expect((await report(undefined, { reason: "spam" })).status).toBe(401);
    expect((await report(author, { reason: "spam" })).status).toBe(403);
    expect((await report(reporter, { reason: "spam" }, "00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await report(reporter, { reason: "rude" })).status).toBe(400);
    expect((await report(reporter, { reason: "spam", details: "x".repeat(501) })).status).toBe(400);
    expect(harness.reports).toEqual([]);
  });

  it("limits how fast one account files reports", async () => {
    const author = await signIn("Author");
    const reporter = await signIn("Reporter");
    const { id } = await saveAndPublish(author, "custom-1", "Reported deck");
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt += 1)
      statuses.push((await call(`/community/decks/${id}/reports`, "POST", reporter, { reason: "spam" })).status);
    expect(statuses).toEqual([204, 204, 204, 204, 204, 429]);
  });
});

describe("the moderation queue of reported decks", () => {
  const queue = async (player: Player) =>
    ((await (await call("/admin/community/reports", "GET", player)).json()) as { decks: ReportedCommunityDeck[] })
      .decks;
  const openReports = async (id: string, player: Player) =>
    (
      (await (await call(`/admin/community/decks/${id}/reports`, "GET", player)).json()) as {
        reports: CommunityDeckReport[];
      }
    ).reports;

  it("stores reports, one open report per reporter, for admins to read", async () => {
    const author = await signIn("Author");
    const first = await signIn("First");
    const second = await signIn("Second");
    const admin = await signIn("Admin", { admin: true });
    const { id } = await saveAndPublish(author, "custom-1", "Reported deck");

    await call(`/community/decks/${id}/reports`, "POST", first, { reason: "spam" });
    await call(`/community/decks/${id}/reports`, "POST", first, { reason: "offensive_name", details: "worse" });
    await call(`/community/decks/${id}/reports`, "POST", second, { reason: "other" });

    expect(await queue(admin)).toEqual([
      expect.objectContaining({ id, name: "Reported deck", authorName: "Author", status: "public", openReports: 2 }),
    ]);
    const reports = await openReports(id, admin);
    expect(reports.map(({ reason, details, reporterName }) => [reason, details, reporterName])).toEqual([
      ["other", null, "Second"],
      ["offensive_name", "worse", "First"],
    ]);
  });

  it("closes the reports when the deck is hidden or they are dismissed", async () => {
    const author = await signIn("Author");
    const reporter = await signIn("Reporter");
    const admin = await signIn("Admin", { admin: true });
    const hidden = await saveAndPublish(author, "custom-1", "Hidden deck");
    const fine = await saveAndPublish(author, "custom-2", "Fine deck");
    await call(`/community/decks/${hidden.id}/reports`, "POST", reporter, { reason: "spam" });
    await call(`/community/decks/${fine.id}/reports`, "POST", reporter, { reason: "spam" });

    await call(`/admin/community/decks/${hidden.id}/moderation`, "POST", admin, { action: "hide", reason: "spam" });
    expect((await queue(admin)).map((deck) => deck.id)).toEqual([fine.id]);

    const dismissed = await call(`/admin/community/decks/${fine.id}/reports/dismiss`, "POST", admin);
    expect(await dismissed.json()).toEqual({ dismissed: 1 });
    expect(await queue(admin)).toEqual([]);

    await call(`/community/decks/${fine.id}/reports`, "POST", reporter, { reason: "other" });
    expect((await queue(admin))[0]).toMatchObject({ id: fine.id, openReports: 1 });
  });

  it("is for admins only", async () => {
    const author = await signIn("Author");
    const { id } = await saveAndPublish(author, "custom-1", "Deck");
    for (const [path, method] of [
      ["/admin/community/reports", "GET"],
      [`/admin/community/decks/${id}/reports`, "GET"],
      [`/admin/community/decks/${id}/reports/dismiss`, "POST"],
    ] as const) {
      expect((await call(path, method)).status).toBe(401);
      expect((await call(path, method, author)).status).toBe(403);
    }
  });

  it("keeps the stored report when the public copy fails", async () => {
    await harness.close();
    harness = await startHarness({
      report: () => Promise.reject(new Error("GitHub refused the issue: 403")),
    });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const author = await signIn("Author");
    const reporter = await signIn("Reporter");
    const admin = await signIn("Admin", { admin: true });
    const { id } = await saveAndPublish(author, "custom-1", "Deck");
    expect((await call(`/community/decks/${id}/reports`, "POST", reporter, { reason: "spam" })).status).toBe(204);
    expect((await queue(admin))[0]).toMatchObject({ id, openReports: 1 });
    quiet.mockRestore();
  });

  it("works with no public copy at all", async () => {
    await harness.close();
    harness = await startHarness(null);
    const author = await signIn("Author");
    const reporter = await signIn("Reporter");
    const { id } = await saveAndPublish(author, "custom-1", "Deck");
    expect((await call(`/community/decks/${id}/reports`, "POST", reporter, { reason: "spam" })).status).toBe(204);
  });
});

describe("moderation", () => {
  const moderate = (id: string, player: Player | undefined, action: string, extra: Record<string, unknown> = {}) =>
    call(`/admin/community/decks/${id}/moderation`, "POST", player, {
      action,
      ...(action === "hide" ? { reason: "offensive_name" } : {}),
      ...extra,
    });
  const requestReview = (player: Player, deckId: string, note?: string) =>
    call(`/community/publications/${deckId}/review`, "POST", player, note === undefined ? {} : { note });
  const publications = async (player: Player) =>
    (await (await call("/community/publications", "GET", player)).json()) as CommunityPublication[];
  const queue = async (player: Player) =>
    ((await (await call("/admin/community/reports", "GET", player)).json()) as { decks: ReportedCommunityDeck[] })
      .decks;

  it("is for admins only", async () => {
    const author = await signIn("Author");
    const { id } = await saveAndPublish(author, "custom-1", "Deck");
    expect((await moderate(id, undefined, "hide")).status).toBe(401);
    expect((await moderate(id, author, "hide")).status).toBe(403);
    const admin = await signIn("Admin", { admin: true });
    expect((await moderate(id, admin, "delete")).status).toBe(400);
    expect((await moderate(id, admin, "hide", { reason: "boring" })).status).toBe(400);
    expect((await moderate(id, admin, "hide", { note: "x".repeat(501) })).status).toBe(400);
    expect((await moderate("00000000-0000-0000-0000-000000000000", admin, "hide")).status).toBe(404);
  });

  it("hides a deck from players but not from admins, and the owner cannot republish it", async () => {
    const author = await signIn("Author");
    const admin = await signIn("Admin", { admin: true });
    const { id } = await saveAndPublish(author, "custom-1", "Rude deck");
    expect(await (await moderate(id, admin, "hide")).json()).toEqual({ status: "hidden" });
    expect((await browse()).decks).toEqual([]);
    expect((await call(`/community/decks/${id}`, "GET", author)).status).toBe(404);
    expect(await (await call(`/community/decks/${id}`, "GET", admin)).json()).toMatchObject({ status: "hidden" });
    expect((await call(`/community/decks/${id}/like`, "PUT", admin)).status).toBe(404);
    const republish = await call("/community/publications/custom-1", "PUT", author);
    expect(republish.status).toBe(422);
    expect(await republish.json()).toEqual({ error: "deck_hidden" });
    expect((await call("/community/publications/custom-1", "DELETE", author)).status).toBe(404);
    expect(await (await call("/community/publications", "GET", author)).json()).toEqual([
      expect.objectContaining({ id, status: "hidden" }),
    ]);
  });

  it("hides an unpublished deck so it cannot come back, and restores a hidden one", async () => {
    const author = await signIn("Author");
    const admin = await signIn("Admin", { admin: true });
    const { id } = await saveAndPublish(author, "custom-1", "Deck");
    await call("/community/publications/custom-1", "DELETE", author);
    expect(await (await moderate(id, admin, "hide")).json()).toEqual({ status: "hidden" });
    expect((await call("/community/publications/custom-1", "PUT", author)).status).toBe(422);
    expect(await (await moderate(id, admin, "restore")).json()).toEqual({ status: "public" });
    expect((await browse()).decks.map((deck) => deck.id)).toEqual([id]);
  });

  it("leaves an unpublished deck unpublished on restore", async () => {
    const author = await signIn("Author");
    const admin = await signIn("Admin", { admin: true });
    const { id } = await saveAndPublish(author, "custom-1", "Deck");
    await call("/community/publications/custom-1", "DELETE", author);
    expect(await (await moderate(id, admin, "restore")).json()).toEqual({ status: "unpublished" });
  });

  it("shows the owner the reason and note the moderator gave when hiding", async () => {
    const author = await signIn("Author");
    const admin = await signIn("Admin", { admin: true });
    const { id } = await saveAndPublish(author, "custom-1", "Rude deck");
    await moderate(id, admin, "hide", { note: "  Please rename it.  " });
    expect(await publications(author)).toEqual([
      expect.objectContaining({
        id,
        status: "hidden",
        moderation: expect.objectContaining({
          reason: "offensive_name",
          note: "Please rename it.",
          reviewRequestedAt: null,
        }),
      }),
    ]);
    expect(await (await call(`/community/decks/${id}`, "GET", admin)).json()).toMatchObject({
      moderation: { reason: "offensive_name", note: "Please rename it." },
    });
  });

  it("sends the edited deck for review and keeps it hidden until approved", async () => {
    const author = await signIn("Author");
    const admin = await signIn("Admin", { admin: true });
    const { id } = await saveAndPublish(author, "custom-1", "Rude deck");
    await moderate(id, admin, "hide");
    await harness.store.saveDeck(author.id, {
      id: "custom-1",
      name: "Polite deck",
      mainDeck: [...redList!.mainDeck],
      eggDeck: [...redList!.eggDeck],
    });

    const requested = await requestReview(author, "custom-1", "Renamed it");
    expect(requested.status).toBe(200);
    expect(await requested.json()).toMatchObject({
      id,
      name: "Polite deck",
      status: "hidden",
      moderation: { reason: "offensive_name", reviewNote: "Renamed it", reviewRequestedAt: expect.any(Number) },
    });
    expect((await browse()).decks).toEqual([]);
    expect(await queue(admin)).toEqual([
      expect.objectContaining({
        id,
        name: "Polite deck",
        status: "hidden",
        openReports: 0,
        lastReportedAt: null,
        reviewNote: "Renamed it",
        reviewRequestedAt: expect.any(Number),
      }),
    ]);

    expect(await (await moderate(id, admin, "restore")).json()).toEqual({ status: "public" });
    expect((await browse()).decks.map((deck) => [deck.id, deck.name])).toEqual([[id, "Polite deck"]]);
    expect(await queue(admin)).toEqual([]);
    expect((await publications(author))[0]).not.toHaveProperty("moderation");
  });

  it("refuses a second review request while one is pending", async () => {
    const author = await signIn("Author");
    const admin = await signIn("Admin", { admin: true });
    const { id } = await saveAndPublish(author, "custom-1", "Deck");
    await moderate(id, admin, "hide");
    expect((await requestReview(author, "custom-1")).status).toBe(200);
    const again = await requestReview(author, "custom-1");
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "review_pending" });
  });

  it("refuses a review request for a deck that is not hidden or still has a blocked name", async () => {
    const author = await signIn("Author");
    const admin = await signIn("Admin", { admin: true });
    const { id } = await saveAndPublish(author, "custom-1", "Deck");
    expect(await (await requestReview(author, "custom-1")).json()).toEqual({ error: "deck_not_hidden" });
    expect((await requestReview(author, "custom-missing")).status).toBe(404);
    expect((await requestReview(author, "custom-1", "x".repeat(501))).status).toBe(400);

    await moderate(id, admin, "hide");
    await harness.store.saveDeck(author.id, {
      id: "custom-1",
      name: "Muerte a la Royal Base",
      mainDeck: [...redList!.mainDeck],
      eggDeck: [...redList!.eggDeck],
    });
    const blocked = await requestReview(author, "custom-1");
    expect(blocked.status).toBe(422);
    expect(await blocked.json()).toEqual({ error: "name_not_allowed" });
    expect(await queue(admin)).toEqual([]);
  });

  it("keeps a declined deck hidden with the moderator's note and lets the owner ask again", async () => {
    const author = await signIn("Author");
    const admin = await signIn("Admin", { admin: true });
    const { id } = await saveAndPublish(author, "custom-1", "Deck");
    await moderate(id, admin, "hide");
    await requestReview(author, "custom-1", "Fixed");

    expect(await (await moderate(id, admin, "decline_review", { note: "Still offensive." })).json()).toEqual({
      status: "hidden",
    });
    expect(await queue(admin)).toEqual([]);
    expect((await publications(author))[0]?.moderation).toMatchObject({
      reason: "offensive_name",
      note: "Still offensive.",
      reviewRequestedAt: null,
      reviewNote: null,
    });
    expect((await requestReview(author, "custom-1")).status).toBe(200);
  });
});

describe("community random selection", () => {
  it("draws from public decks beyond the first browse page and excludes hidden, unpublished and illegal lists", async () => {
    const author = await signIn("Random Author");
    const published = await saveAndPublish(author, "random-source", "Random Source");
    await harness.store.pool.query("UPDATE public_decks SET status='hidden' WHERE id=$1", [published.id]);
    for (let n = 1; n <= 130; n += 1) {
      await harness.store.pool.query(
        `INSERT INTO public_decks (id,account_id,source_deck_id,name,colors,main_deck,egg_deck,main_deck_arts,egg_deck_arts,published_at,updated_at,status)
         SELECT $2,account_id,$3,name,colors,main_deck,egg_deck,main_deck_arts,egg_deck_arts,published_at,updated_at,'public' FROM public_decks WHERE id=$1`,
        [published.id, `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, `random-${n}`],
      );
    }
    const result = await call("/community/decks/random?format=standard&beta=false");
    expect(result.status).toBe(200);
    const selection = (await result.json()) as { eligibleCount: number; deck: CommunityDeck };
    expect(selection.eligibleCount).toBe(130);
    expect(selection.deck.status).toBe("public");
    expect(selection.deck.id).not.toBe(published.id);
    expect(selection.deck.mainDeck).toEqual(redList!.mainDeck);
    await harness.store.pool.query("UPDATE public_decks SET status='unpublished' WHERE source_deck_id='random-1'");
    await harness.store.pool.query("UPDATE public_decks SET status='hidden' WHERE source_deck_id='random-2'");
    await harness.store.pool.query("UPDATE public_decks SET main_deck='[]'::jsonb WHERE source_deck_id='random-3'");
    const filtered = (await (await call("/community/decks/random?format=standard")).json()) as {
      eligibleCount: number;
    };
    expect(filtered.eligibleCount).toBe(127);
    await harness.store.pool.query(
      "UPDATE public_decks SET main_deck='[]'::jsonb WHERE source_deck_id <> 'random-130'",
    );
    const last = (await (await call("/community/decks/random")).json()) as {
      eligibleCount: number;
      deck: CommunityDeck;
    };
    expect(last.eligibleCount).toBe(1);
    expect(last.deck.id).toBe("00000000-0000-4000-8000-000000000130");
  });
  it("refuses unknown formats and beta values", async () => {
    expect((await call("/community/decks/random?format=unknown")).status).toBe(400);
    expect((await call("/community/decks/random?beta=yes")).status).toBe(400);
  });
});

it("filters random community decks by beta, historical pool, Pauper and Unlimited rules", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
  try {
    const author = await signIn("Format Author");
    const { id } = await saveAndPublish(author, "formats-source", "Format Source");
    const betaMain = [...redList!.mainDeck];
    betaMain[0] = "EX13-007";
    await harness.store.pool.query("UPDATE public_decks SET main_deck=$1 WHERE id=$2", [JSON.stringify(betaMain), id]);
    const released = await (await call("/community/decks/random?beta=false")).json();
    expect(released).toEqual({ deck: null, eligibleCount: 0 });
    const beta = (await (await call("/community/decks/random?beta=true")).json()) as {
      eligibleCount: number;
      deck: CommunityDeck;
    };
    expect(beta.eligibleCount).toBe(1);
    expect(beta.deck.mainDeck).toEqual(betaMain);
    expect(await (await call("/community/decks/random?format=BT1&beta=true")).json()).toEqual({
      deck: null,
      eligibleCount: 0,
    });
    expect(await (await call("/community/decks/random?format=pauper&beta=true")).json()).toEqual({
      deck: null,
      eligibleCount: 0,
    });
    const bannedMain = [...redList!.mainDeck];
    bannedMain[0] = "BT5-109";
    await harness.store.pool.query("UPDATE public_decks SET main_deck=$1 WHERE id=$2", [
      JSON.stringify(bannedMain),
      id,
    ]);
    const unlimited = (await (await call("/community/decks/random?format=unlimited")).json()) as {
      eligibleCount: number;
    };
    expect(unlimited.eligibleCount).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});

describe("deck guides", () => {
  it("saves normalized guides separately and preserves them across republication", async () => {
    const author = await signIn("Author");
    const { id } = await saveAndPublish(author, "guide-deck", "Guide deck");
    const before = (await (await call(`/community/decks/${id}`)).json()) as CommunityDeck;
    const saved = await call(`/community/decks/${id}/guide`, "PUT", author, {
      guide: "## Start  \r\n\r\nPlay BT1-009  ",
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ guide: "## Start\n\nPlay BT1-009" });
    const after = (await (await call(`/community/decks/${id}`)).json()) as CommunityDeck;
    expect(after).toEqual({ ...before, guide: "## Start\n\nPlay BT1-009", hasGuide: true });
    const summary = (await browse()).decks[0]!;
    expect(summary.hasGuide).toBe(true);
    expect(summary).not.toHaveProperty("guide");
    expect(await (await call("/community/publications", "GET", author)).json()).toEqual([
      expect.objectContaining({ outdated: false }),
    ]);
    await saveAndPublish(author, "guide-deck", "Revised name");
    expect(await (await call(`/community/decks/${id}`)).json()).toMatchObject({ guide: after.guide });
  });

  it("requires the owner of a public deck and allows admins to read hidden guides", async () => {
    const author = await signIn("Author");
    const other = await signIn("Other");
    const admin = await signIn("Admin", { admin: true });
    const { id } = await saveAndPublish(author, "guide-deck", "Guide deck");
    const path = `/community/decks/${id}/guide`;
    expect((await call(path, "PUT", undefined, { guide: "Start" })).status).toBe(401);
    expect((await call(path, "PUT", other, { guide: "Start" })).status).toBe(404);
    expect((await call("/community/decks/not-a-uuid/guide", "PUT", author, { guide: "Start" })).status).toBe(404);
    await call(path, "PUT", author, { guide: "Start" });
    await harness.store.pool.query("UPDATE public_decks SET status='hidden' WHERE id=$1", [id]);
    expect((await call(path, "PUT", author, { guide: "Edit" })).status).toBe(404);
    expect(await (await call(`/community/decks/${id}`, "GET", admin)).json()).toMatchObject({ guide: "Start" });
  });

  it.each([null, "   "])("clears a guide using %j", async (guide) => {
    const author = await signIn("Author");
    const { id } = await saveAndPublish(author, "guide-deck", "Guide deck");
    await call(`/community/decks/${id}/guide`, "PUT", author, { guide: "Start" });
    expect(await (await call(`/community/decks/${id}/guide`, "PUT", author, { guide })).json()).toEqual({
      guide: null,
    });
    expect((await browse()).decks[0]!.hasGuide).toBe(false);
  });

  it.each([
    [{ guide: "x".repeat(5001) }, 422, "guide_too_long"],
    [{ guide: "Caralho" }, 422, "guide_not_allowed"],
    [{ guide: "Muerte a la Royal Base" }, 422, "guide_not_allowed"],
    [{ guide: "cazzo" }, 422, "guide_not_allowed"],
    [{ guide: 12 }, 400, "invalid_guide"],
    [{}, 400, "invalid_guide"],
    [[], 400, "invalid_guide"],
  ])("rejects malformed or disallowed guides", async (body, status, error) => {
    const author = await signIn("Author");
    const { id } = await saveAndPublish(author, "guide-deck", "Guide deck");
    const response = await call(`/community/decks/${id}/guide`, "PUT", author, body);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });

  it("shares the publication rate limit", async () => {
    const author = await signIn("Author");
    const { id } = await saveAndPublish(author, "guide-deck", "Guide deck");
    for (let attempt = 0; attempt < 9; attempt += 1) {
      expect((await call(`/community/decks/${id}/guide`, "PUT", author, { guide: "Start" })).status).toBe(200);
    }
    const limited = await call(`/community/decks/${id}/guide`, "PUT", author, { guide: "Start" });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "too_many_requests" });
  });
});
