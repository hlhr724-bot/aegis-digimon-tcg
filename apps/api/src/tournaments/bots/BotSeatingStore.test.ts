import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "../../accounts/AccountStore.js";
import { metaDecksForBlock } from "../../bot/metaDecks/index.js";
import { validateDecklist } from "../../engine/deckValidation.js";
import type { Pool } from "pg";
import { snapshotFixtures } from "../../db/snapshotFixture.js";
import { inProcessTournamentLock } from "../participants/index.js";
import { BotSeatingStore } from "./BotSeatingStore.js";

/**
 * Seating bots at the close of check-in, against pg-mem.
 *
 * The decks are the real shipped ones, so a legality regression in `metaDecks` surfaces here as a
 * failing tournament rather than as a bot the engine refuses to deal a hand to.
 */

let accounts: AccountStore;
let seating: BotSeatingStore;
let organizer: string;
let tournamentId: string;

async function createTournament(overrides: { allowBots?: boolean; maxPlayers?: number } = {}) {
  const tournament = await accounts.createTournament(organizer, {
    name: "Lightning Cup",
    block: "BT10",
    startsAt: 1,
    maxPlayers: overrides.maxPlayers ?? 8,
    allowBots: overrides.allowBots ?? true,
  });
  tournamentId = tournament.id;
  return tournament;
}

async function addHuman(name: string): Promise<string> {
  const account = await accounts.accountForIdentity("discord", name, name);
  const id = randomUUID();
  await accounts.pool.query(
    `INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, status, deck_snapshot, created_at)
     VALUES ($1,$2,'human',$3,$4,'active',$5,$6)`,
    [
      id,
      tournamentId,
      account.id,
      name,
      JSON.stringify({ deckId: null, name: "D", mainDeck: [], eggDeck: [], revision: 1 }),
      Date.now(),
    ],
  );
  return id;
}

async function humanRows() {
  return (
    await accounts.pool.query(
      "SELECT id, display_name, status, deck_snapshot FROM tournament_participants WHERE tournament_id=$1 AND kind='human' ORDER BY created_at, id",
      [tournamentId],
    )
  ).rows;
}

type Fixture = { accounts: AccountStore; seating: BotSeatingStore; organizer: string; tournamentId: string };

/** One arrangement, built once and restored before each test. */
const fixtureFor = snapshotFixtures<Fixture>();

/**
 * Assigns the file's module-level bindings rather than shadowing them: the helpers below
 * (`createTournament`, `addHuman`, ...) read those bindings directly.
 */
async function buildFixture(pool: Pool): Promise<Fixture> {
  accounts = new AccountStore(pool);
  seating = new BotSeatingStore(accounts, inProcessTournamentLock());
  organizer = (await accounts.accountForIdentity("discord", "organizer", "Organizer")).id;
  await createTournament();
  return { accounts, seating, organizer, tournamentId };
}

beforeEach(async () => {
  ({ accounts, seating, organizer, tournamentId } = await fixtureFor("default", buildFixture));
});

describe("filling a short field", () => {
  it("completes five humans to eight with three bots", async () => {
    for (const name of ["a", "b", "c", "d", "e"]) await addHuman(name);
    const outcome = await seating.fillAtClose({ tournamentId });
    expect(outcome).toMatchObject({ kind: "seated", targetSize: 8 });
    expect(outcome.kind === "seated" && outcome.participantIds).toHaveLength(3);
    expect(await seating.bots(tournamentId)).toHaveLength(3);
  });

  it("leaves every confirmed human exactly as it found them", async () => {
    for (const name of ["a", "b", "c", "d", "e"]) await addHuman(name);
    const before = await humanRows();
    await seating.fillAtClose({ tournamentId });
    expect(await humanRows()).toEqual(before);
  });

  it("seats nothing when the tournament forbids bots", async () => {
    await createTournament({ allowBots: false });
    for (const name of ["a", "b", "c"]) await addHuman(name);
    expect(await seating.fillAtClose({ tournamentId })).toEqual({ kind: "skipped", reason: "bots_not_allowed" });
    expect(await seating.bots(tournamentId)).toEqual([]);
  });

  it("asks for a cancellation rather than running one person against machines", async () => {
    await addHuman("a");
    expect(await seating.fillAtClose({ tournamentId })).toEqual({ kind: "cancel", reason: "below_minimum" });
    expect(await seating.bots(tournamentId)).toEqual([]);
  });

  it("counts only confirmed humans, not registrations that never checked in", async () => {
    for (const name of ["a", "b", "c"]) await addHuman(name);
    // A fourth entrant who registered and never showed: dropped at close, so the field is three.
    const noShow = await accounts.accountForIdentity("discord", "d", "d");
    await accounts.pool.query(
      "INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, status, created_at) VALUES ($1,$2,'human',$3,'d','dropped',5)",
      [randomUUID(), tournamentId, noShow.id],
    );
    const outcome = await seating.fillAtClose({ tournamentId });
    expect(outcome).toMatchObject({ kind: "seated", targetSize: 4 });
    expect(outcome.kind === "seated" && outcome.participantIds).toHaveLength(1);
  });

  it("seats bots exactly once, however often it is called", async () => {
    for (const name of ["a", "b", "c"]) await addHuman(name);
    const first = await seating.fillAtClose({ tournamentId });
    const second = await seating.fillAtClose({ tournamentId });
    expect(second.kind).toBe("seated");
    expect(await seating.bots(tournamentId)).toHaveLength(1);
    expect(first.kind === "seated" && first.participantIds).toEqual(
      (await seating.bots(tournamentId)).map((bot) => bot.id),
    );
  });

  it("seats nobody when the block has no legal deck at all", async () => {
    const empty = new BotSeatingStore(accounts, inProcessTournamentLock(), () => []);
    for (const name of ["a", "b", "c"]) await addHuman(name);
    expect(await empty.fillAtClose({ tournamentId })).toEqual({ kind: "skipped", reason: "no_legal_bot_deck" });
  });

  it("skips a deck the tournament's OWN frozen banlist forbids and takes the next legal one", async () => {
    // The shipped lists are vetted against today's banlist, but a tournament judges every deck by
    // the snapshot IT froze. An event frozen at a date where a card is banned must not seat a bot
    // on a list running it — every human deck in that field was checked against exactly this list.
    const decks = metaDecksForBlock("BT10");
    expect(decks.length).toBeGreaterThan(1);
    const forbidden = decks[0]!;
    const bannedCard = forbidden.decklist.mainDeck[0]!;
    // The card is chosen from the first deck, so the ban must actually eliminate that deck and the
    // fill must fall through to one that does not run it.
    const survivors = decks.filter((deck) => !deck.decklist.mainDeck.includes(bannedCard));
    expect(survivors.length).toBeGreaterThan(0);
    await accounts.pool.query("UPDATE tournaments SET banlist_cards=$1 WHERE id=$2", [
      JSON.stringify([{ cardId: bannedCard, copies: 0 }]),
      tournamentId,
    ]);

    for (const name of ["a", "b", "c"]) await addHuman(name);
    const outcome = await seating.fillAtClose({ tournamentId });
    expect(outcome.kind).toBe("seated");
    const seatedVersions = (await seating.bots(tournamentId)).map((bot) => bot.deckVersion);
    expect(seatedVersions).not.toContain(forbidden.deckVersion);
    for (const bot of await seating.bots(tournamentId)) expect(bot.deckSnapshot!.mainDeck).not.toContain(bannedCard);
  });

  it("seats nobody when the frozen banlist forbids every deck of the block", async () => {
    // The documented fallback: a short field beats a machine playing a card the event has banned.
    const cards = new Set(metaDecksForBlock("BT10").flatMap((deck) => deck.decklist.mainDeck));
    await accounts.pool.query("UPDATE tournaments SET banlist_cards=$1 WHERE id=$2", [
      JSON.stringify([...cards].map((cardId) => ({ cardId, copies: 0 }))),
      tournamentId,
    ]);
    for (const name of ["a", "b", "c"]) await addHuman(name);
    expect(await seating.fillAtClose({ tournamentId })).toEqual({ kind: "skipped", reason: "no_legal_bot_deck" });
    expect(await seating.bots(tournamentId)).toEqual([]);
  });

  it("falls back to the newest covered block for a label that has no decks of its own", async () => {
    await accounts.pool.query("UPDATE tournaments SET block='ST1' WHERE id=$1", [tournamentId]);
    expect(metaDecksForBlock("ST1")).toEqual([]);
    for (const name of ["a", "b", "c"]) await addHuman(name);
    const outcome = await seating.fillAtClose({ tournamentId });
    expect(outcome.kind).toBe("seated");
    expect((await seating.bots(tournamentId))[0]?.deckVersion).toBeTruthy();
  });
});

describe("what a seated bot brings", () => {
  it("copies a legal, versioned deck into its own snapshot", async () => {
    for (const name of ["a", "b", "c"]) await addHuman(name);
    await seating.fillAtClose({ tournamentId });
    const bot = (await seating.bots(tournamentId))[0]!;

    expect(bot.deckSnapshot).toBeTruthy();
    expect(bot.deckVersion).toBeTruthy();
    expect(validateDecklist({ mainDeck: bot.deckSnapshot!.mainDeck, eggDeck: bot.deckSnapshot!.eggDeck })).toEqual({
      ok: true,
    });
  });

  it("copies the shipped list rather than sharing the frozen instance", async () => {
    for (const name of ["a", "b", "c"]) await addHuman(name);
    await seating.fillAtClose({ tournamentId });
    const bot = (await seating.bots(tournamentId))[0]!;
    const shipped = metaDecksForBlock("BT10").find((deck) => deck.deckVersion === bot.deckVersion)!;
    expect(bot.deckSnapshot!.mainDeck).toEqual([...shipped.decklist.mainDeck]);
    // Mutating the snapshot cannot reach the shipped deck.
    bot.deckSnapshot!.mainDeck.push("BT1-001");
    expect(shipped.decklist.mainDeck).not.toContain("BT1-001");
  });

  it("records the personality it will play under", async () => {
    for (const name of ["a", "b", "c", "d", "e"]) await addHuman(name);
    await seating.fillAtClose({ tournamentId });
    const profiles = (
      await accounts.pool.query<{ bot_profile: string }>(
        "SELECT bot_profile FROM tournament_participants WHERE tournament_id=$1 AND kind='bot'",
        [tournamentId],
      )
    ).rows.map((row) => row.bot_profile);
    expect(profiles).toHaveLength(3);
    expect(profiles.every((profile) => ["balanced", "aggressive", "defensive"].includes(profile))).toBe(true);
  });

  it("gives every bot a name of its own", async () => {
    for (const name of ["a", "b", "c", "d", "e"]) await addHuman(name);
    await seating.fillAtClose({ tournamentId });
    const names = (await seating.bots(tournamentId)).map((bot) => bot.displayName);
    expect(new Set(names).size).toBe(names.length);
  });
});
