import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "../../accounts/AccountStore.js";
import type { Pool } from "pg";
import { snapshotFixtures } from "../../db/snapshotFixture.js";
import { RED_DECK } from "../../engine/testDecks.js";
import { BotSeatingStore } from "../bots/index.js";
import { EliminationStore } from "../elimination/index.js";
import { inProcessTournamentLock, ParticipantStore } from "../participants/index.js";
import { openEliminationEvent } from "./openEliminationEvent.js";

/** Check-in close, bot fill and the draw, in the one order that produces a correct field. */

let accounts: AccountStore;
let participants: ParticipantStore;
let bots: BotSeatingStore;
let elimination: EliminationStore;
let organizer: string;
let tournamentId: string;

async function createTournament(allowBots: boolean, maxPlayers = 8): Promise<void> {
  const tournament = await accounts.createTournament(organizer, {
    name: "Lightning Cup",
    block: "BT10",
    startsAt: 1,
    maxPlayers,
    allowBots,
  });
  tournamentId = tournament.id;
}

/** Registers a person with a legal saved deck, and optionally checks them in. */
async function enter(name: string, checkIn: boolean): Promise<string> {
  const account = await accounts.accountForIdentity("discord", name, name);
  await accounts.saveDeck(account.id, {
    id: "deck",
    name: "Deck",
    mainDeck: [...RED_DECK.mainDeck],
    eggDeck: [...RED_DECK.eggDeck],
  });
  const registered = await participants.register({ tournamentId, accountId: account.id, savedDeckId: "deck" });
  if (!registered.ok) throw new Error(registered.reason);
  if (checkIn) {
    const checked = await participants.checkIn({ tournamentId, accountId: account.id });
    if (!checked.ok) throw new Error(checked.reason);
  }
  return account.id;
}

type Fixture = {
  accounts: AccountStore;
  participants: ParticipantStore;
  bots: BotSeatingStore;
  elimination: EliminationStore;
  organizer: string;
  tournamentId: string;
};

/** One arrangement, built once and restored before each test. */
const fixtureFor = snapshotFixtures<Fixture>();

/**
 * Assigns the file's module-level bindings rather than shadowing them: the helpers below
 * (`createTournament`, `addHuman`, ...) read those bindings directly.
 */
async function buildFixture(pool: Pool): Promise<Fixture> {
  accounts = new AccountStore(pool);
  const lock = inProcessTournamentLock();
  participants = new ParticipantStore(accounts, lock);
  bots = new BotSeatingStore(accounts, lock);
  elimination = new EliminationStore(accounts, lock);
  organizer = (await accounts.accountForIdentity("discord", "organizer", "Organizer")).id;
  await createTournament(true);
  return { accounts, participants, bots, elimination, organizer, tournamentId };
}

beforeEach(async () => {
  ({ accounts, participants, bots, elimination, organizer, tournamentId } = await fixtureFor("default", buildFixture));
});

function open() {
  return openEliminationEvent({ tournamentId, participants, bots, elimination });
}

describe("opening a lightning cup", () => {
  it("fills five confirmed people to eight and draws the bracket", async () => {
    for (const name of ["a", "b", "c", "d", "e"]) await enter(name, true);
    const outcome = await open();
    expect(outcome).toMatchObject({ kind: "running", botsSeated: 3 });
    if (outcome.kind !== "running") return;
    expect(outcome.bracket.size).toBe(8);
    expect(outcome.bracket.matches.filter((match) => match.status === "bye")).toHaveLength(0);
  });

  it("counts only confirmed people, so a no-show never becomes a reason to seat a bot", async () => {
    for (const name of ["a", "b", "c"]) await enter(name, true);
    await enter("ghost", false);
    const outcome = await open();
    expect(outcome).toMatchObject({ kind: "running", botsSeated: 1 });
    if (outcome.kind !== "running") return;
    expect(outcome.bracket.size).toBe(4);
  });

  it("cancels rather than running one person against machines", async () => {
    await enter("a", true);
    await enter("ghost", false);
    expect(await open()).toEqual({ kind: "cancel", reason: "below_minimum" });
    // Nothing was drawn, so nothing has to be unwound.
    expect(await elimination.bracket(tournamentId)).toBeUndefined();
    expect(await bots.bots(tournamentId)).toEqual([]);
  });

  it("records the cancellation as a state anybody can read", async () => {
    await enter("a", true);
    await open();
    expect((await accounts.tournament(tournamentId))?.status).toBe("cancelled");
    // Nobody is left holding a slot in an event that will not happen.
    expect((await participants.participants(tournamentId)).every((entry) => entry.status === "dropped")).toBe(true);
  });

  it("cannot be re-opened, or bot-filled, after it was cancelled", async () => {
    await enter("a", true);
    await open();
    const latecomer = await accounts.accountForIdentity("discord", "late", "Late");
    await accounts.saveDeck(latecomer.id, {
      id: "deck",
      name: "Deck",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
    });
    expect(await participants.register({ tournamentId, accountId: latecomer.id, savedDeckId: "deck" })).toMatchObject({
      ok: false,
      reason: "registration_closed",
    });
    expect(await participants.checkIn({ tournamentId, accountId: latecomer.id })).toMatchObject({ ok: false });
    expect(await open()).toMatchObject({ kind: "failed" });
    expect(await bots.bots(tournamentId)).toEqual([]);
    expect(await elimination.bracket(tournamentId)).toBeUndefined();
  });

  it("runs a competitive event short-handed rather than with bots", async () => {
    await createTournament(false);
    for (const name of ["a", "b", "c"]) await enter(name, true);
    const outcome = await open();
    expect(outcome).toMatchObject({ kind: "running", botsSeated: 0 });
    if (outcome.kind !== "running") return;
    expect(outcome.bracket.matches.filter((match) => match.status === "bye")).toHaveLength(1);
  });

  it("is idempotent: a second call neither re-fills nor redraws", async () => {
    for (const name of ["a", "b", "c"]) await enter(name, true);
    const first = await open();
    const second = await open();
    expect(second.kind).toBe("running");
    expect(await bots.bots(tournamentId)).toHaveLength(1);
    if (first.kind !== "running" || second.kind !== "running") return;
    expect(second.bracket.matches).toEqual(first.bracket.matches);
  });

  it("seats every bot with a deck the room will accept", async () => {
    for (const name of ["a", "b", "c"]) await enter(name, true);
    await open();
    for (const bot of await bots.bots(tournamentId)) {
      expect(bot.deckSnapshot?.mainDeck.length).toBe(50);
      expect(bot.status).toBe("active");
    }
  });
});
