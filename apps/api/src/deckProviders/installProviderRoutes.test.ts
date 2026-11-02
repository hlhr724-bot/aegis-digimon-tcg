import { BT1_DECKS } from "@aegis/shared/decks/bt1";
import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { installProviderRoutes } from "#api/deckProviders/installProviderRoutes";
import { ProviderError } from "#api/deckProviders/ProviderError";

const close: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of close.splice(0)) {
    await cleanup();
  }
});
async function start(get: (path: string) => Promise<unknown>) {
  const app = express();
  installProviderRoutes({ app, client: { get } });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  close.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/deck-providers`;
}
it("validates filters before reaching the provider and selects the current competitive set", async () => {
  const get = vi.fn<(path: string) => Promise<unknown>>(async (path: string) => {
    if (path.startsWith("meta")) {
      return { data: [], pagination: { page: 1, total_pages: 1 }, formats: [{ format: "EX13", display_name: "EX13" }] };
    }
    return { data: [], pagination: { page: 1, total_pages: 0 } };
  });
  const url = await start(get);
  expect((await fetch(`${url}/digilab/lists?page=0`)).status).toBe(400);
  expect((await fetch(`${url}/unknown/meta`)).status).toBe(404);
  expect(get).not.toHaveBeenCalled();
  expect((await fetch(`${url}/digilab/lists?sort=placement&archetype=15`)).status).toBe(200);
  expect(get.mock.calls[1]?.[0]).toContain("format=EX13");
  expect(get.mock.calls[1]?.[0]).toContain("sort_dir=asc");
  expect(get.mock.calls[1]?.[0]).toContain("archetype_id=15");
});
it("returns recoverable errors without leaking upstream details", async () => {
  const url = await start(async () => {
    throw new ProviderError(503, 45);
  });
  const response = await fetch(`${url}/digilab/meta`);
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("45");
  expect(await response.json()).toEqual({ error: "digilab_unavailable" });
});

it("caps collection browsing at 25 archetypes and bounds list sizes", async () => {
  const get = vi.fn<(path: string) => Promise<unknown>>(async () => ({
    data: [],
    formats: [],
    pagination: { page: 1, total_pages: 1 },
  }));
  const url = await start(get);
  expect((await fetch(`${url}/digilab/meta?format=EX13&perPage=25`)).status).toBe(200);
  expect(get.mock.calls[0]?.[0]).toContain("per_page=25");
  expect((await fetch(`${url}/digilab/lists?format=EX13&archetype=1&perPage=3`)).status).toBe(200);
  expect(get.mock.calls[1]?.[0]).toContain("per_page=3");
  expect((await fetch(`${url}/digilab/meta?perPage=26`)).status).toBe(400);
  expect((await fetch(`${url}/digilab/meta?perPage=0`)).status).toBe(400);
  expect(get).toHaveBeenCalledTimes(2);
});

it("includes a playable saved list and its cover when loading an archetype", async () => {
  const deck = BT1_DECKS[0]!.decklist;
  const get = vi.fn<(path: string) => Promise<unknown>>(async (path) => {
    if (path.startsWith("meta")) {
      return { data: [{ archetype_id: 1, display_card_id: "BT1-084" }], pagination: { page: 1, total_pages: 1 } };
    }
    if (path.startsWith("decklists")) {
      return { data: [{ result_id: 1 }, { result_id: 2 }], pagination: { page: 1, total_pages: 1 } };
    }
    if (path === "decklist/1") {
      return { result_id: 1, decklist: null };
    }
    return {
      result_id: 2,
      decklist: {
        digimon: deck.mainDeck.map((card_id) => ({ card_id, count: 1 })),
        eggs: deck.eggDeck.map((card_id) => ({ card_id, count: 1 })),
        tamers: [],
        options: [],
      },
    };
  });
  const url = await start(get);
  const response = await fetch(`${url}/digilab/meta?format=EX13&perPage=25`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    data: [
      {
        playableDeck: {
          id: 2,
          coverCardId: "BT1-084",
          mainDeck: [...deck.mainDeck],
          legality: { legal: true },
        },
      },
    ],
  });
});

it.each(["incomplete", "restricted"])("excludes %s provider decks from playable archetypes", async (violation) => {
  const deck = BT1_DECKS[0]!.decklist;
  const mainDeck =
    violation === "incomplete" ? deck.mainDeck.slice(1) : ["BT2-047", "BT2-047", ...deck.mainDeck.slice(2)];
  const url = await start(async (path) => {
    if (path.startsWith("meta")) {
      return { data: [{ archetype_id: 1 }], pagination: { page: 1, total_pages: 1 } };
    }
    if (path.startsWith("decklists")) {
      return { data: [{ result_id: 1 }], pagination: { page: 1, total_pages: 1 } };
    }
    return {
      result_id: 1,
      decklist: {
        digimon: mainDeck.map((card_id) => ({ card_id, count: 1 })),
        eggs: deck.eggDeck.map((card_id) => ({ card_id, count: 1 })),
        tamers: [],
        options: [],
      },
    };
  });
  const response = await fetch(`${url}/digilab/meta?format=BT26&playFormat=standard`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ data: [{ playableDeck: null }] });
  const detail = await fetch(`${url}/digilab/1?playFormat=standard`);
  expect(await detail.json()).toMatchObject({ mainDeck, legality: { legal: false } });
  const unlimited = await fetch(`${url}/digilab/meta?format=BT26&playFormat=unlimited`);
  const playableDeck = violation === "restricted" ? { mainDeck, legality: { legal: true } } : null;
  expect(await unlimited.json()).toMatchObject({ data: [{ playableDeck }] });
});
