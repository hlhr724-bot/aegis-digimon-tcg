import type { MatchHistoryPage } from "@aegis/shared";
import { ReplayLibrary } from "../replays/ReplayLibrary.js";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryPool } from "../db/memoryPool.fixture.js";
import { AccountStore } from "./AccountStore.js";
import { installAccountRoutes } from "./routes.js";

type Harness = {
  url: string;
  cookie: string;
  store: AccountStore;
  close: () => Promise<void>;
};

let harness: Harness;

async function startHarness(): Promise<Harness> {
  const store = new AccountStore(createMemoryPool());
  const app = express();
  app.use(express.json());
  installAccountRoutes(app, store);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const account = await store.accountForIdentity(
    "discord",
    "avatar-owner",
    "Tamer",
    "https://example.com/provider.png",
  );
  const session = await store.issueSession(account);
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    cookie: `aegis_session=${session.id}`,
    store,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function putAvatar(avatarId: unknown, authenticated = true): Promise<Response> {
  return fetch(`${harness.url}/account/profile/avatar`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: harness.cookie } : {}),
    },
    body: JSON.stringify({ avatarId }),
  });
}

async function putDisplayName(displayName: unknown, authenticated = true): Promise<Response> {
  return fetch(`${harness.url}/account/profile/display-name`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(authenticated ? { Cookie: harness.cookie } : {}) },
    body: JSON.stringify({ displayName }),
  });
}

beforeEach(async () => {
  harness = await startHarness();
});

afterEach(async () => {
  await harness.close();
  await harness.store.close();
});

describe("PUT /account/profile/avatar", () => {
  it("persists an allowlisted Digimon while keeping the provider avatar", async () => {
    const updated = await putAvatar("tyrannomon");
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      avatarId: "tyrannomon",
      avatarUrl: "https://example.com/provider.png",
    });

    const sessionResponse = await fetch(`${harness.url}/auth/me`, { headers: { Cookie: harness.cookie } });
    expect(await sessionResponse.json()).toMatchObject({ avatarId: "tyrannomon" });
  });

  it("#5255 restores the provider avatar and keeps that choice in a new session read", async () => {
    expect((await putAvatar("tyrannomon")).status).toBe(200);
    const reset = await putAvatar(null);
    expect(reset.status).toBe(200);
    expect(await reset.json()).toMatchObject({ avatarId: null, avatarUrl: "https://example.com/provider.png" });
    const session = await fetch(`${harness.url}/auth/me`, { headers: { Cookie: harness.cookie } });
    expect(await session.json()).toMatchObject({ avatarId: null, avatarUrl: "https://example.com/provider.png" });
    expect((await putAvatar(undefined)).status).toBe(400);
  });

  it("rejects unknown ids without changing the account", async () => {
    const rejected = await putAvatar("../outside");
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: "invalid avatar" });

    const sessionResponse = await fetch(`${harness.url}/auth/me`, { headers: { Cookie: harness.cookie } });
    expect(await sessionResponse.json()).toMatchObject({ avatarId: null });
  });

  it("requires an authenticated account", async () => {
    expect((await putAvatar("tyrannomon", false)).status).toBe(401);
  });
});

describe("PUT /account/profile/display-name", () => {
  it("renames the authenticated account and exposes it through the session", async () => {
    const response = await putDisplayName("  New   Tamer ");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ displayName: "New Tamer" });
    expect(await (await fetch(`${harness.url}/auth/me`, { headers: { Cookie: harness.cookie } })).json()).toMatchObject(
      { displayName: "New Tamer" },
    );
  });

  it("returns stable validation and uniqueness errors while allowing repeated changes", async () => {
    expect((await putDisplayName("x")).status).toBe(400);
    await harness.store.accountForIdentity("discord", "taken-owner", "Already Taken");
    const taken = await putDisplayName("already taken");
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: "display_name_taken" });
    expect((await putDisplayName("Available Name")).status).toBe(200);
    expect((await putDisplayName("Another Name")).status).toBe(200);
  });

  it("rate limits excessive nickname changes", async () => {
    const statuses = [];
    for (let index = 0; index < 11; index++) statuses.push((await putDisplayName(`Tamer ${index}`)).status);
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
  });

  it("requires an authenticated account", async () => {
    expect((await putDisplayName("New Tamer", false)).status).toBe(401);
  });
});

async function putPreferences(changes: unknown, authenticated = true): Promise<Response> {
  return fetch(`${harness.url}/account/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(authenticated ? { Cookie: harness.cookie } : {}) },
    body: JSON.stringify(changes),
  });
}

async function getPreferences(): Promise<unknown> {
  return (await fetch(`${harness.url}/account/preferences`, { headers: { Cookie: harness.cookie } })).json();
}

describe("/account/preferences", () => {
  it("starts empty and merges each partial update into the stored preferences", async () => {
    expect(await getPreferences()).toEqual({});
    expect((await putPreferences({ darkMode: true, locale: "pt-BR" })).status).toBe(200);
    const merged = await putPreferences({ sleeve: "omnimon" });
    expect(await merged.json()).toEqual({ darkMode: true, locale: "pt-BR", sleeve: "omnimon" });
    await putPreferences({ darkMode: false });
    expect(await getPreferences()).toEqual({ darkMode: false, locale: "pt-BR", sleeve: "omnimon" });
  });

  it("stores the Digi-Egg sleeve beside the main sleeve", async () => {
    expect((await putPreferences({ sleeve: "omnimon", eggSleeve: "gold" })).status).toBe(200);
    expect(await getPreferences()).toEqual({ sleeve: "omnimon", eggSleeve: "gold" });
    expect((await putPreferences({ eggSleeve: "x".repeat(65) })).status).toBe(400);
  });

  it("persists the identical Tamer grouping opt-out and rejects non-boolean values", async () => {
    expect((await putPreferences({ groupIdenticalTamers: false })).status).toBe(200);
    expect(await getPreferences()).toEqual({ groupIdenticalTamers: false });
    for (const value of ["false", 0, null, []]) {
      expect((await putPreferences({ groupIdenticalTamers: value })).status).toBe(400);
    }
    expect(await getPreferences()).toEqual({ groupIdenticalTamers: false });
    expect((await putPreferences({ groupIdenticalTamers: true })).status).toBe(200);
    expect(await getPreferences()).toEqual({ groupIdenticalTamers: true });
  });

  it("stores and restores the auto hatch preference, including false", async () => {
    expect((await putPreferences({ autoHatch: true })).status).toBe(200);
    expect(await getPreferences()).toEqual({ autoHatch: true });
    expect((await putPreferences({ autoHatch: false })).status).toBe(200);
    expect(await getPreferences()).toEqual({ autoHatch: false });
  });

  it("stores and restores trophy visibility and rejects non-boolean values", async () => {
    expect((await putPreferences({ profileTrophies: true })).status).toBe(200);
    expect(await getPreferences()).toEqual({ profileTrophies: true });
    expect((await putPreferences({ profileTrophies: false })).status).toBe(200);
    expect(await getPreferences()).toEqual({ profileTrophies: false });
    expect((await putPreferences({ profileTrophies: "false" })).status).toBe(400);
  });

  it("stores and restores the profile stats choice, including false", async () => {
    expect((await putPreferences({ profileStats: true })).status).toBe(200);
    expect(await getPreferences()).toEqual({ profileStats: true });
    expect((await putPreferences({ profileStats: false })).status).toBe(200);
    expect(await getPreferences()).toEqual({ profileStats: false });
    expect((await putPreferences({ profileStats: "true" })).status).toBe(400);
  });

  it("persists the post-match sharing opt-out and rejects non-booleans", async () => {
    expect((await putPreferences({ shareDeckAfterMatch: false })).status).toBe(200);
    expect(await getPreferences()).toEqual({ shareDeckAfterMatch: false });
    expect((await putPreferences({ shareDeckAfterMatch: true })).status).toBe(200);
    expect(await getPreferences()).toEqual({ shareDeckAfterMatch: true });
    expect((await putPreferences({ shareDeckAfterMatch: "false" })).status).toBe(400);
  });

  it("persists the live match listing opt-in and rejects non-booleans", async () => {
    expect(await getPreferences()).toEqual({});
    expect((await putPreferences({ listLiveMatches: true })).status).toBe(200);
    expect(await getPreferences()).toEqual({ listLiveMatches: true });
    expect((await putPreferences({ listLiveMatches: false })).status).toBe(200);
    expect(await getPreferences()).toEqual({ listLiveMatches: false });
    expect((await putPreferences({ listLiveMatches: "true" })).status).toBe(400);
    expect((await putPreferences({ hideIdentityFromSpectators: true })).status).toBe(200);
    expect(await getPreferences()).toMatchObject({ hideIdentityFromSpectators: true });
    expect((await putPreferences({ hideIdentityFromSpectators: false })).status).toBe(200);
    expect(await getPreferences()).toMatchObject({ hideIdentityFromSpectators: false });
    expect((await putPreferences({ hideIdentityFromSpectators: "true" })).status).toBe(400);
  });

  it("stores card image language and rejects unsupported preferences", async () => {
    for (const cardImageLanguage of ["en", "ja", "ko", "zh"]) {
      expect((await putPreferences({ cardImageLanguage })).status).toBe(200);
      expect(await getPreferences()).toMatchObject({ cardImageLanguage });
    }
    for (const cardImageLanguage of ["pt-BR", "constructor", 1, null]) {
      expect((await putPreferences({ cardImageLanguage })).status).toBe(400);
    }
  });

  it("stores the deck builder layout", async () => {
    const layout = { deckShare: 0.6, deckView: "list", deckSort: "level" };
    expect((await putPreferences(layout)).status).toBe(200);
    expect(await getPreferences()).toEqual(layout);
  });

  it("stores favorite deck ids and replaces the whole list on update", async () => {
    expect((await putPreferences({ favoriteDeckIds: ["custom-1", "custom-3"] })).status).toBe(200);
    expect((await putPreferences({ favoriteDeckIds: ["custom-3"] })).status).toBe(200);
    expect(await getPreferences()).toEqual({ favoriteDeckIds: ["custom-3"] });
    expect((await putPreferences({ favoriteDeckIds: [] })).status).toBe(200);
    expect(await getPreferences()).toEqual({ favoriteDeckIds: [] });
  });

  it("rejects favorite deck lists that are malformed, repeated or longer than the deck limit", async () => {
    for (const invalid of [
      { favoriteDeckIds: "custom-1" },
      { favoriteDeckIds: [1] },
      { favoriteDeckIds: [""] },
      { favoriteDeckIds: ["x".repeat(65)] },
      { favoriteDeckIds: ["custom-1", "custom-1"] },
      { favoriteDeckIds: Array.from({ length: 101 }, (_, index) => `custom-${index}`) },
    ]) {
      expect((await putPreferences(invalid)).status).toBe(400);
    }
    expect(await getPreferences()).toEqual({});
  });

  it("rejects wrong types, unknown keys and long values without changing anything", async () => {
    await putPreferences({ darkMode: true });
    for (const invalid of [
      { autoHatch: "true" },
      { autoHatch: 1 },
      { autoHatch: null },
      { darkMode: "yes" },
      { theme: "dark" },
      { locale: "x".repeat(65) },
      ["darkMode"],
      { deckShare: 2 },
      { deckShare: "0.5" },
      { deckView: "table" },
      { deckSort: "x".repeat(65) },
    ]) {
      const rejected = await putPreferences(invalid);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({ error: "invalid preferences" });
    }
    expect(await getPreferences()).toEqual({ darkMode: true });
  });

  it("requires an authenticated account", async () => {
    expect((await putPreferences({ darkMode: true }, false)).status).toBe(401);
    expect((await fetch(`${harness.url}/account/preferences`)).status).toBe(401);
  });
});

it("links a recent match only to the authenticated owner's saved recording", async () => {
  const session = await harness.store.session(harness.cookie.split("=")[1]);
  const owner = session!.account;
  const library = new ReplayLibrary(harness.store);
  const summary = {
    id: "recording-id",
    players: [owner.displayName, "Opponent"] as [string, string],
    mode: "casual" as const,
    startedAt: 1,
    finishedAt: 2,
    winnerSeat: 0,
    frameCount: 2,
  };
  await harness.store.recordRecentMatch(owner.id, "room-id", {
    id: summary.id,
    mode: "casual",
    opponentName: "Opponent",
    opponentKind: "human",
    result: "win",
    reason: "surrender",
    finishedAt: 2,
  });
  const other = await harness.store.accountForIdentity("email", "other-replay@test.invalid", "Other");
  const ready = (viewerSeat: 0 | 1) => ({
    kind: "ready" as const,
    summary,
    viewerSeat,
    data: Buffer.from("archive").toString("base64"),
  });
  const foreign = await library.record(other.id, ready(1));
  await library.attachDrive(other.id, foreign, "foreignDriveFile01");
  const profile = () => fetch(`${harness.url}/account/matches`, { headers: { Cookie: harness.cookie } });
  expect(await (await profile()).json()).toMatchObject({ matches: [{ replay: null }] });
  const indexId = await library.record(owner.id, ready(0));
  expect(await (await profile()).json()).toMatchObject({ matches: [{ replay: null }] });
  await library.attachDrive(owner.id, indexId, "ownerDriveFile0001");
  const response = await profile();
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toMatchObject({
    matches: [{ replay: { id: indexId, driveFileId: "ownerDriveFile0001", visibility: "private" } }],
  });
  await library.remove(owner.id, indexId);
  expect(await (await profile()).json()).toMatchObject({ matches: [{ replay: null }] });
});

describe("GET /account/matches", () => {
  const matches = (query = "", authenticated = true) =>
    fetch(`${harness.url}/account/matches${query}`, { headers: authenticated ? { Cookie: harness.cookie } : {} });
  const ownerId = async () => (await harness.store.session(harness.cookie.split("=")[1]))!.account.id;
  async function seed(count: number) {
    const id = await ownerId();
    for (let index = 0; index < count; index++)
      await harness.store.recordRecentMatch(id, `room-${index}`, {
        id: `match-${index}`,
        mode: "casual",
        opponentName: "Opponent",
        opponentKind: "human",
        result: index % 2 ? "loss" : "win",
        reason: "surrender",
        finishedAt: index,
      });
    return id;
  }

  it("pages the history newest first with the total for the filter", async () => {
    await seed(30);
    const first = await matches();
    expect(first.headers.get("cache-control")).toContain("no-store");
    const body = (await first.json()) as MatchHistoryPage;
    expect(body).toMatchObject({
      total: 30,
      page: 1,
      limit: 25,
      sharing: false,
      winRate: { matches: 30, wins: 15, losses: 15, draws: 0 },
    });
    expect(body.matches).toHaveLength(25);
    expect(body.matches[0]).toMatchObject({ id: "match-29", replay: null });
    const second = (await (await matches("?page=2&limit=25")).json()) as MatchHistoryPage;
    expect(second.matches.map((match) => match.id)).toEqual(["match-4", "match-3", "match-2", "match-1", "match-0"]);
    expect(await (await matches("?result=loss&limit=5")).json()).toMatchObject({
      total: 15,
      limit: 5,
      winRate: { matches: 30, wins: 15, losses: 15, draws: 0 },
    });
    expect(await (await matches("?mode=ranked")).json()).toMatchObject({ matches: [], total: 0 });
    const searched = (await (
      await matches("?opponent=%20OPPONENT%20&mode=casual&result=win")
    ).json()) as MatchHistoryPage;
    expect(searched.total).toBe(15);
    expect(await (await matches(`?opponent=${"x".repeat(32)}`)).json()).toMatchObject({ total: 0 });
  });

  it.each([
    "?page=0",
    "?page=-1",
    "?page=1.5",
    "?page=abc",
    "?limit=0",
    "?limit=51",
    "?page=1&page=2",
    "?result=wins",
    "?result=win&result=loss",
    "?mode=arena",
    `?opponent=${"x".repeat(33)}`,
    "?opponent=a&opponent=b",
  ])("rejects %s", async (query) => {
    const response = await matches(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_query" });
  });

  it("requires a session", async () => {
    expect((await matches("", false)).status).toBe(401);
  });

  it("summarizes the history in the profile instead of listing it", async () => {
    await seed(3);
    const response = await fetch(`${harness.url}/account/profile`, { headers: { Cookie: harness.cookie } });
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.summary).toEqual({ matches: 3, wins: 2, losses: 1, draws: 0, replaysSaved: 0 });
    expect(body).not.toHaveProperty("matches");
  });
});

describe("avatar sources", () => {
  const me = async () => (await fetch(`${harness.url}/auth/me`, { headers: { Cookie: harness.cookie } })).json();
  it("shows the Discord picture until the player picks a Digimon or their initials", async () => {
    expect(await me()).toMatchObject({
      avatarId: null,
      avatarSource: "discord",
      avatarUrl: "https://example.com/provider.png",
    });
    expect(await (await putAvatar("greymon")).json()).toMatchObject({ avatarId: "greymon", avatarSource: "digimon" });
    const initials = await putAvatar("initials");
    expect(initials.status).toBe(200);
    expect(await initials.json()).toMatchObject({ avatarId: null, avatarUrl: null, avatarSource: "initials" });
    expect(await me()).toMatchObject({ avatarId: null, avatarUrl: null, avatarSource: "initials" });
    expect(await (await putAvatar(null)).json()).toMatchObject({
      avatarId: null,
      avatarUrl: "https://example.com/provider.png",
      avatarSource: "discord",
    });
  });

  it("accepts initials in the combined profile update", async () => {
    const response = await fetch(`${harness.url}/account/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: harness.cookie },
      body: JSON.stringify({ displayName: "Tamer", avatarId: "initials" }),
    });
    expect(await response.json()).toMatchObject({ avatarId: null, avatarUrl: null, avatarSource: "initials" });
  });

  it("keeps initials when the Discord picture is refreshed", async () => {
    await putAvatar("initials");
    const id = (await harness.store.session(harness.cookie.split("=")[1]))!.account.id;
    await harness.store.setAvatarUrl(id, "https://example.com/refreshed.png");
    expect(await harness.store.account(id)).toMatchObject({ avatarUrl: null, avatarSource: "initials" });
    await putAvatar(null);
    expect(await harness.store.account(id)).toMatchObject({
      avatarUrl: "https://example.com/refreshed.png",
      avatarSource: "discord",
    });
  });
});

describe("atomic profile customization", () => {
  const update = (body: unknown, authenticated = true) =>
    fetch(`${harness.url}/account/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(authenticated ? { Cookie: harness.cookie } : {}) },
      body: JSON.stringify(body),
    });
  it.each(["Tamer.Name", "Li", "Tamer 🌟"])(
    "preserves existing provider name %s for avatar changes",
    async (displayName) => {
      const account = await harness.store.accountForIdentity("discord", `legacy-${displayName}`, displayName);
      const session = await harness.store.issueSession(account);
      harness.cookie = `aegis_session=${session.id}`;
      const response = await update({ displayName: account.displayName, avatarId: "greymon" });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ displayName: account.displayName, avatarId: "greymon" });
    },
  );
  it("saves both identity fields and can reset the provider avatar", async () => {
    const response = await update({ displayName: "New Tamer", avatarId: "greymon" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ displayName: "New Tamer", avatarId: "greymon" });
    expect((await update({ displayName: "New Tamer", avatarId: null })).status).toBe(200);
    const session = await fetch(`${harness.url}/auth/me`, { headers: { Cookie: harness.cookie } });
    expect(await session.json()).toMatchObject({ displayName: "New Tamer", avatarId: null });
  });
  it("rejects unauthorized, invalid, and conflicting changes without partially saving the avatar", async () => {
    expect((await update({ displayName: "Valid Tamer", avatarId: "greymon" }, false)).status).toBe(401);
    expect((await update({ displayName: "x", avatarId: "greymon" })).status).toBe(400);
    expect((await update({ displayName: "Valid Tamer", avatarId: "bad-avatar" })).status).toBe(400);
    await harness.store.accountForIdentity("discord", "other-customizer", "Taken Tamer");
    expect((await update({ displayName: "Taken Tamer", avatarId: "greymon" })).status).toBe(409);
    const session = await fetch(`${harness.url}/auth/me`, { headers: { Cookie: harness.cookie } });
    expect(await session.json()).toMatchObject({ displayName: "Tamer", avatarId: null });
  });
});
