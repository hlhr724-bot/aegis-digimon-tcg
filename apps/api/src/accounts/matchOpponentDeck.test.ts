import { buildDeckCompositionKey } from "#api/accounts/buildDeckCompositionKey";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { AccountStore } from "#api/accounts/AccountStore";
import { installAccountRoutes } from "#api/accounts/routes";

const snapshot: UsedDeck = {
  deckId: "private-deck-id",
  deckName: "Starting list",
  mainDeck: ["AD1-001", "AD1-001"],
  eggDeck: ["BT1-001"],
  mainDeckArts: ["AD1-001", "AD1-001_P1"],
  eggDeckArts: ["BT1-001"],
  format: "standard",
};

let store: AccountStore;
let close: () => Promise<void>;
let url: string;
let cookie: string;
let viewerId: string;
let ownerId: string;

beforeEach(async () => {
  store = new AccountStore(createMemoryPool());
  const viewer = await store.accountForIdentity("discord", "viewer", "Viewer");
  const owner = await store.accountForIdentity("discord", "owner", "Owner");
  viewerId = viewer.id;
  ownerId = owner.id;
  cookie = `aegis_session=${(await store.issueSession(viewer)).id}`;
  const app = express();
  app.use(express.json());
  installAccountRoutes(app, store);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  await store.recordRecentMatch(viewerId, "finished-room", {
    id: "finished-match",
    mode: "casual",
    opponentName: "Owner",
    opponentKind: "human",
    result: "win",
    reason: "surrender",
    finishedAt: Date.now(),
    ownDeck: { ...structuredClone(snapshot), deckName: "My starting list" },
    opponentDeck: structuredClone(snapshot),
    opponentDeckOwnerAccountId: ownerId,
  });
});

afterEach(async () => {
  await close();
  await store.close();
});

describe("finished opponent decks", () => {
  it("requires an authenticated participant's retained match and hides all private metadata in history", async () => {
    expect((await fetch(`${url}/account/matches/finished-match/opponent-deck`)).status).toBe(401);
    const outsider = await store.accountForIdentity("discord", "outsider", "Outsider");
    const outsiderSession = await store.issueSession(outsider);
    expect(
      (
        await fetch(`${url}/account/matches/finished-match/opponent-deck`, {
          headers: { Cookie: `aegis_session=${outsiderSession.id}` },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${url}/account/matches/in-progress/opponent-deck`, {
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(404);
    const history = await fetch(`${url}/account/matches?page=1&limit=25`, { headers: { Cookie: cookie } });
    const body = await history.json();
    expect(body.matches[0]).toMatchObject({ id: "finished-match", hasOpponentDeck: true });
    expect(JSON.stringify(body)).not.toContain("private-deck-id");
    expect(JSON.stringify(body)).not.toContain(ownerId);
    expect(body.matches[0]).not.toHaveProperty("opponentDeck");
    expect(body.matches[0]).not.toHaveProperty("opponentDeckOwnerAccountId");
  });

  it("returns the exact frozen cards and artwork with no private deck id and observes current sharing changes", async () => {
    const getDeck = () => fetch(`${url}/account/matches/finished-match/opponent-deck`, { headers: { Cookie: cookie } });
    const response = await getDeck();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ...snapshot, deckId: null });
    await store.updatePreferences(ownerId, { shareDeckAfterMatch: false });
    expect((await getDeck()).status).toBe(404);
    expect((await store.matchHistory(viewerId, { page: 1, limit: 25 })).matches[0]?.hasOpponentDeck).toBe(false);
    await store.updatePreferences(ownerId, { shareDeckAfterMatch: true });
    expect((await getDeck()).status).toBe(200);
    const first = await store.getMatchOpponentDeck({ accountId: viewerId, matchId: "finished-match" });
    first!.mainDeck[0] = "BT1-010";
    expect((await store.getMatchOpponentDeck({ accountId: viewerId, matchId: "finished-match" }))?.mainDeck).toEqual(
      snapshot.mainDeck,
    );
  });

  it("supports bot and guest snapshots while treating legacy records as unavailable", async () => {
    await store.recordRecentMatch(viewerId, "bot-room", {
      id: "bot-match",
      mode: "bot",
      opponentName: "Bot",
      opponentKind: "bot",
      result: "loss",
      reason: "surrender",
      finishedAt: Date.now(),
      opponentDeck: structuredClone(snapshot),
    });
    expect((await store.getMatchOpponentDeck({ accountId: viewerId, matchId: "bot-match" }))?.deckName).toBe(
      "Starting list",
    );
    await store.recordRecentMatch(viewerId, "legacy-room", {
      id: "legacy-match",
      mode: "casual",
      opponentName: "Guest",
      opponentKind: "human",
      result: "draw",
      reason: "draw",
      finishedAt: Date.now(),
    });
    expect(await store.getMatchOpponentDeck({ accountId: viewerId, matchId: "legacy-match" })).toBeUndefined();
    expect(
      (await store.matchHistory(viewerId, { page: 1, limit: 25 })).matches.find((entry) => entry.id === "legacy-match")
        ?.hasOpponentDeck,
    ).toBe(false);
  });
});

describe("finished own decks", () => {
  it("serves only the participant's frozen list even after the saved deck is changed or deleted", async () => {
    const path = `${url}/account/matches/finished-match/own-deck`;
    expect((await fetch(path)).status).toBe(401);
    const outsider = await store.accountForIdentity("discord", "own-outsider", "Other Tamer");
    const session = await store.issueSession(outsider);
    expect((await fetch(path, { headers: { Cookie: `aegis_session=${session.id}` } })).status).toBe(404);
    await store.saveDeck(viewerId, { id: snapshot.deckId!, name: "Changed list", mainDeck: ["BT1-010"], eggDeck: [] });
    await store.deleteDeck(viewerId, snapshot.deckId!);
    const response = await fetch(path, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ...snapshot, deckId: null, deckName: "My starting list" });
    const history = await store.matchHistory(viewerId, { page: 1, limit: 25 });
    expect(history.matches[0]?.hasOwnDeck).toBe(true);
    expect(history.matches[0]).not.toHaveProperty("ownDeck");
    expect(history.matches[0]).not.toHaveProperty("ownDeckKey");
    await store.updatePreferences(viewerId, { shareDeckAfterMatch: false });
    expect((await fetch(path, { headers: { Cookie: cookie } })).status).toBe(200);
  });

  it("recovers previously tracked compositions and handles missing or malformed older metadata", async () => {
    for (const [id, key] of [
      ["tracked", buildDeckCompositionKey(snapshot)],
      ["malformed", "{bad"],
      ["legacy", undefined],
    ] as const) {
      await store.recordRecentMatch(viewerId, id, {
        id,
        mode: "casual",
        opponentName: "Opponent",
        opponentKind: "human",
        result: "win",
        reason: "security",
        finishedAt: Date.now(),
        ownDeckName: "Original name",
        ownDeckKey: key,
      });
    }
    const response = await fetch(`${url}/account/matches/tracked/own-deck`, { headers: { Cookie: cookie } });
    expect(await response.json()).toEqual({
      deckId: null,
      deckName: "Original name",
      mainDeck: [...snapshot.mainDeck].sort(),
      eggDeck: snapshot.eggDeck,
      format: "standard",
    });
    for (const id of ["malformed", "legacy", "missing"]) {
      expect((await fetch(`${url}/account/matches/${id}/own-deck`, { headers: { Cookie: cookie } })).status).toBe(404);
    }
  });
});
