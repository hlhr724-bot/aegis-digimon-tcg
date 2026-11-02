import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "../accounts/AccountStore.js";
import { installAccountRoutes } from "../accounts/routes.js";
import type { Pool } from "pg";
import { snapshotFixtures } from "../db/snapshotFixture.js";
import { RED_DECK } from "../engine/testDecks.js";

/**
 * The banlist requirement end to end, over the real HTTP surface: a tournament freezes a resolved
 * banlist at creation, and every later deck registration is judged by THAT list rather than by the
 * list in force today.
 *
 * The unit suites already prove resolution (`rules/banlistPolicy.test.ts`) and enforcement
 * (`participants/deckLegality.test.ts`) in isolation. What only a wire-level test can prove is that
 * the two are wired to each other through the database: the same deck must be admitted by an event
 * frozen on an old collection's date and refused by an event frozen on today's, with nothing in
 * between re-reading the live banlist.
 *
 * The dates are real published banlist history, so the test would notice a resolution that silently
 * fell back to "today":
 *
 *  - Mega Digimon Fusion! (BT5-109) — banned from 2022-02-25, legal on BT5's 2021-08-06 release.
 *  - Gravity Crush (BT1-090) — restricted to 1 from 2025-09-01, unrestricted in 2021.
 *  - Mother D-Reaper (EX2-007) / Shoto Kazama (EX7-064) — a banned PAIR from 2025-03-28; each is
 *    legal alone, and neither restriction existed in 2021.
 */

const BANNED_TODAY = "BT5-109";
const RESTRICTED_TODAY = "BT1-090";
const PAIR_EGG = "EX2-007";
const PAIR_MAIN = "EX7-064";
/** A collection released before any of the three restrictions above was published. */
const OLD_SET = "BT5";

const PLAYERS = ["alice", "bob", "carol", "dave"] as const;
type Player = (typeof PLAYERS)[number];

let accounts: AccountStore;
let url: string;
let close: () => Promise<void>;
let cookieOf: Map<string, string>;

// oxlint-disable-next-line typescript/no-explicit-any -- a wire body is untyped by definition
type Wire = any;

async function request(
  method: "GET" | "POST" | "PUT",
  path: string,
  as: string,
  body?: unknown,
): Promise<{ status: number; body: Wire }> {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookieOf.get(as) ?? "" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = response.headers.get("content-type")?.includes("application/json");
  return { status: response.status, body: json ? await response.json() : null };
}

type Deck = { mainDeck: string[]; eggDeck: string[] };

/** The base list with `count` copies of `removed` swapped for `added`, so the deck stays 50 + 5. */
function swap(cards: readonly string[], removed: string, added: string, count: number): string[] {
  const swapped = [...cards];
  for (let index = 0; index < count; index += 1) swapped[swapped.indexOf(removed)] = added;
  return swapped;
}

function mainSwap(removed: string, added: string, count: number): Deck {
  return { mainDeck: swap(RED_DECK.mainDeck, removed, added, count), eggDeck: [...RED_DECK.eggDeck] };
}

const LEGAL_DECK: Deck = { mainDeck: [...RED_DECK.mainDeck], eggDeck: [...RED_DECK.eggDeck] };
/** Four copies of a card banned outright today, legal at four copies in 2021. */
const BANNED_DECK = mainSwap("BT1-009", BANNED_TODAY, 4);
/** Four copies of a card capped at one today; the base list already carries the first. */
const RESTRICTED_DECK = mainSwap("BT1-009", RESTRICTED_TODAY, 3);
/** Both halves of a banned pair, one in each deck half — legal alone, illegal together, since 2025. */
const PAIR_DECK: Deck = {
  mainDeck: swap(RED_DECK.mainDeck, "BT1-009", PAIR_MAIN, 1),
  eggDeck: swap(RED_DECK.eggDeck, "BT1-001", PAIR_EGG, 1),
};
/** Five copies of an ordinary card: a printed-limit break no banlist policy can excuse. */
const OVER_PRINTED_LIMIT_DECK = mainSwap("BT1-009", "BT1-020", 1);

async function saveDeck(as: Player, deck: Deck): Promise<string> {
  const response = await request("PUT", "/account/decks", as, { name: "Competitive", ...deck });
  expect(response.status).toBe(200);
  return response.body.id as string;
}

async function createTournament(banlist: unknown, bestOf: 1 | 3): Promise<string> {
  const created = await request("POST", "/tournaments", "organizer", {
    name: "Banlist Cup",
    structure: bestOf === 3 ? "swiss" : "single_elimination",
    bestOf: bestOf === 3 ? 3 : 1,
    topCut: false,
    startsAt: Date.now() + 86_400_000,
    maxPlayers: 8,
    banlist,
  });
  expect(created.status).toBe(201);
  return created.body.id as string;
}

const frozenOnOldSet = () => createTournament({ mode: "as_of_set", setId: OLD_SET }, 3);
const frozenOnToday = () => createTournament({ mode: "current" }, 3);
const unrestricted = () => createTournament({ mode: "none" }, 1);

async function register(as: Player, tournamentId: string, deck: Deck): Promise<{ status: number; body: Wire }> {
  return request("POST", `/tournaments/${tournamentId}/participants`, as, { savedDeckId: await saveDeck(as, deck) });
}

type Fixture = { accounts: AccountStore; url: string; close: () => Promise<void>; cookieOf: Map<string, string> };

/**
 * One express server and one database for the file, restored to its just-started state before each
 * test. Assigns the module-level bindings rather than shadowing them: the helpers below read them.
 */
const fixtureFor = snapshotFixtures<Fixture>();

async function buildFixture(pool: Pool): Promise<Fixture> {
  accounts = new AccountStore(pool);
  const app = express();
  app.use(express.json());
  installAccountRoutes(app, accounts);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));

  cookieOf = new Map();
  for (const name of ["organizer", ...PLAYERS]) {
    const account = await accounts.accountForIdentity("discord", name, name);
    if (name === "organizer")
      await accounts.pool.query("UPDATE accounts SET roles=ARRAY['admin'] WHERE id=$1", [account.id]);
    cookieOf.set(name, `aegis_session=${(await accounts.issueSession(account)).id}`);
  }
  return { accounts, url, close, cookieOf };
}

beforeEach(async () => {
  ({ accounts, url, close, cookieOf } = await fixtureFor("default", buildFixture));
});

// The server and its database are shared for the file (see `fixtureFor` above), so they are torn
// down once at the end rather than after each test.
afterAll(async () => {
  await close();
  await accounts.close();
});

describe("a tournament's frozen banlist, from creation to deck registration", () => {
  it("admits under an old collection's banlist the decks today's banlist refuses", async () => {
    const tournamentId = await frozenOnOldSet();

    expect((await register("alice", tournamentId, BANNED_DECK)).status).toBe(201);
    expect((await register("bob", tournamentId, RESTRICTED_DECK)).status).toBe(201);
    expect((await register("carol", tournamentId, PAIR_DECK)).status).toBe(201);
  });

  it("refuses those same decks on an event frozen on today's banlist", async () => {
    const tournamentId = await frozenOnToday();

    const banned = await register("alice", tournamentId, BANNED_DECK);
    expect(banned.status).toBe(409);
    expect(banned.body.error).toBe("deck_illegal");
    expect(banned.body.violations).toContainEqual({ kind: "banned", cardId: BANNED_TODAY });

    const restricted = await register("bob", tournamentId, RESTRICTED_DECK);
    expect(restricted.status).toBe(409);
    expect(restricted.body.violations).toContainEqual({
      kind: "over_copy_limit",
      cardId: RESTRICTED_TODAY,
      copies: 4,
      allowed: 1,
    });

    const paired = await register("carol", tournamentId, PAIR_DECK);
    expect(paired.status).toBe(409);
    expect(paired.body.violations).toContainEqual(
      expect.objectContaining({ kind: "banned_pair", conflictsWith: expect.any(String) }),
    );

    // The pair members are only illegal together: the same event takes each of them alone.
    expect((await register("dave", tournamentId, mainSwap("BT1-009", PAIR_MAIN, 1))).status).toBe(201);
  });

  it("enforces no restrictions under mode none, but still enforces the deck-building rules", async () => {
    const tournamentId = await unrestricted();

    expect((await register("alice", tournamentId, BANNED_DECK)).status).toBe(201);
    expect((await register("bob", tournamentId, PAIR_DECK)).status).toBe(201);

    const overPrinted = await register("carol", tournamentId, OVER_PRINTED_LIMIT_DECK);
    expect(overPrinted.status).toBe(409);
    expect(overPrinted.body.violations).toContainEqual({
      kind: "over_copy_limit",
      cardId: "BT1-020",
      copies: 5,
      allowed: 4,
    });

    const short = await register("dave", tournamentId, {
      mainDeck: LEGAL_DECK.mainDeck.slice(1),
      eggDeck: LEGAL_DECK.eggDeck,
    });
    expect(short.status).toBe(409);
    expect(short.body.violations).toContainEqual({ kind: "main_deck_size", size: 49, required: 50 });
  });

  it("publishes each event's frozen list on the detail view the UI renders", async () => {
    const [oldSet, today, open] = [await frozenOnOldSet(), await frozenOnToday(), await unrestricted()];

    const oldCards: Wire[] = (await request("GET", `/tournaments/${oldSet}`, "alice")).body.banlistCards;
    const todayCards: Wire[] = (await request("GET", `/tournaments/${today}`, "alice")).body.banlistCards;
    expect((await request("GET", `/tournaments/${open}`, "alice")).body.banlistCards).toEqual([]);

    const idsOf = (cards: Wire[]) => cards.map((card) => card.cardId as string);
    expect(idsOf(oldCards)).not.toContain(BANNED_TODAY);
    expect(idsOf(oldCards)).not.toContain(RESTRICTED_TODAY);
    // Restrictions already published in 2021 are on the old list, so it is a frozen list and not
    // simply an empty one.
    expect(oldCards).toContainEqual({ cardId: "BT2-047", status: "restricted", allowedCopies: 1 });

    expect(todayCards).toContainEqual({ cardId: BANNED_TODAY, status: "banned", allowedCopies: 0 });
    expect(todayCards).toContainEqual({ cardId: RESTRICTED_TODAY, status: "restricted", allowedCopies: 1 });
    // The pair partners travel with the snapshot, so the UI and deck validation both read the
    // topology the event froze rather than the live pair table.
    expect(todayCards).toContainEqual(
      expect.objectContaining({ cardId: PAIR_EGG, status: "banned_pair", pairPartnerIds: [PAIR_MAIN] }),
    );
  });
});
