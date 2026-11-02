import { hashTournamentPassword } from "#api/tournaments/access/hashTournamentPassword";
import { getCardArts, type TournamentBanlistCard } from "@aegis/shared";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { type Account, AccountStore } from "../../accounts/AccountStore.js";
import { createMemoryPool } from "../../db/memoryPool.fixture.js";
import { snapshotFixtures } from "../../db/snapshotFixture.js";
import { BLUE_DECK, RED_DECK } from "../../engine/testDecks.js";
import { type AcquireTournamentLock, ParticipantStore } from "./ParticipantStore.js";

const T0 = 1_000_000;

type Fixture = { pool: Pool; store: AccountStore; participants: ParticipantStore };

function createFixture(pool: Pool = createMemoryPool()): Fixture {
  const store = new AccountStore(pool as never);
  return { pool, store, participants: new ParticipantStore(store) };
}

/**
 * An empty, already-migrated database. Every test here arranges its own players and tournaments, so
 * all they share is the schema — and re-running the migrator for each of them cost more than the
 * arranging did.
 */
const emptyFixture = snapshotFixtures<Fixture>();

async function createMigratedFixture(): Promise<Fixture> {
  return emptyFixture("empty", async (pool) => {
    const fixture = createFixture(pool);
    await fixture.store.ensureReady();
    return fixture;
  });
}

async function createPlayer(store: AccountStore, name: string): Promise<Account> {
  return store.accountForIdentity("discord", name.toLowerCase(), name);
}

async function saveLegalDeck(store: AccountStore, accountId: string, deck = RED_DECK): Promise<string> {
  return (
    await store.saveDeck(accountId, { name: "Competitive", mainDeck: [...deck.mainDeck], eggDeck: [...deck.eggDeck] })
  ).id;
}

async function createTournament(store: AccountStore, organizerId: string, maxPlayers = 8): Promise<string> {
  return (await store.createTournament(organizerId, { name: "Aegis Cup", block: "BT10", startsAt: T0, maxPlayers })).id;
}

/** The banlist snapshot column belongs to a parallel slice, so tests that need one add it here. */
async function addBanlistColumn(pool: Pool, tournamentId: string, cards: TournamentBanlistCard[]): Promise<void> {
  await pool.query("ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS banlist_cards jsonb");
  await pool.query("UPDATE tournaments SET banlist_cards=$1 WHERE id=$2", [JSON.stringify(cards), tournamentId]);
}

describe("ParticipantStore registration", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createMigratedFixture();
  });

  it("shows the entrant's selected list and freezes it against later deck edits and replacement", async () => {
    const { store, participants } = fixture;
    const player = await createPlayer(store, "Alice");
    const first = await saveLegalDeck(store, player.id);
    const second = await saveLegalDeck(store, player.id, BLUE_DECK);
    const tournamentId = await createTournament(store, player.id);
    await participants.register({ tournamentId, accountId: player.id, savedDeckId: first, now: T0 });
    expect(await participants.getOwnDeck({ tournamentId, accountId: player.id })).toMatchObject({
      savedDeckId: first,
      locked: false,
    });
    expect(
      (await participants.changeDeck({ tournamentId, accountId: player.id, savedDeckId: second, now: T0 })).ok,
    ).toBe(true);
    await participants.checkIn({ tournamentId, accountId: player.id, now: T0 });
    await participants.closeCheckIn({ tournamentId, now: T0 });
    await store.saveDeck(player.id, {
      id: second,
      name: "Changed later",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
    });
    expect(await participants.getOwnDeck({ tournamentId, accountId: player.id })).toMatchObject({
      savedDeckId: second,
      locked: true,
      mainDeck: [...BLUE_DECK.mainDeck],
    });
    expect(await participants.changeDeck({ tournamentId, accountId: player.id, savedDeckId: first, now: T0 })).toEqual({
      ok: false,
      reason: "check_in_closed",
    });
    expect(
      await participants.getOwnDeck({ tournamentId, accountId: "00000000-0000-0000-0000-000000000000" }),
    ).toBeNull();
  });

  it("permits replacement when the selected saved deck was deleted", async () => {
    const { store, participants } = fixture;
    const player = await createPlayer(store, "Alice");
    const first = await saveLegalDeck(store, player.id);
    const second = await saveLegalDeck(store, player.id, BLUE_DECK);
    const tournamentId = await createTournament(store, player.id);
    await participants.register({ tournamentId, accountId: player.id, savedDeckId: first, now: T0 });
    await store.deleteDeck(player.id, first);
    expect(await participants.getOwnDeck({ tournamentId, accountId: player.id })).toMatchObject({
      savedDeckId: first,
      available: false,
      locked: false,
    });
    expect(
      (await participants.changeDeck({ tournamentId, accountId: player.id, savedDeckId: second, now: T0 })).ok,
    ).toBe(true);
    expect(await participants.getOwnDeck({ tournamentId, accountId: player.id })).toMatchObject({
      savedDeckId: second,
      mainDeck: [...BLUE_DECK.mainDeck],
    });
  });

  it("counts competitive entries and releases the displayed place after a drop", async () => {
    const { store, participants } = fixture;
    const player = await createPlayer(store, "Alice");
    const savedDeckId = await saveLegalDeck(store, player.id);
    const tournamentId = await createTournament(store, player.id);
    await participants.register({ tournamentId, accountId: player.id, savedDeckId, now: T0 });
    expect((await store.tournament(tournamentId))?.registrations).toBe(1);
    expect((await store.tournaments()).find((entry) => entry.id === tournamentId)?.registrations).toBe(1);
    await participants.drop({ tournamentId, accountId: player.id, now: T0 + 1 });
    expect((await store.tournament(tournamentId))?.registrations).toBe(0);
  });

  it("requires the event password and rejects legacy registration bypasses", async () => {
    const { store, participants } = fixture;
    const player = await createPlayer(store, "Alice");
    const savedDeckId = await saveLegalDeck(store, player.id);
    const passwordHash = await hashTournamentPassword("community-secret");
    const tournament = await store.createTournament(player.id, {
      name: "Private Cup",
      block: "BT10",
      startsAt: T0,
      maxPlayers: 8,
      passwordHash,
    });
    expect(tournament.passwordProtected).toBe(true);
    expect(tournament).not.toHaveProperty("passwordHash");
    const input = { tournamentId: tournament.id, accountId: player.id, savedDeckId, now: T0 };
    expect(await participants.register(input)).toEqual({ ok: false, reason: "incorrect_password" });
    expect(await participants.register({ ...input, password: "incorrect" })).toEqual({
      ok: false,
      reason: "incorrect_password",
    });
    expect(await store.registerTournament(tournament.id, player.id)).toBe(false);
    expect(await participants.participants(tournament.id)).toEqual([]);
    expect((await participants.register({ ...input, password: "community-secret" })).ok).toBe(true);
  });

  it("registers a player who owns a legal saved deck", async () => {
    const { store, participants } = fixture;
    const player = await createPlayer(store, "Alice");
    const deckId = await saveLegalDeck(store, player.id);
    const tournamentId = await createTournament(store, player.id);

    const result = await participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 });
    expect(result.ok).toBe(true);
    expect(await participants.participantViews(tournamentId)).toEqual([
      {
        id: expect.any(String),
        kind: "human",
        displayName: "Alice",
        status: "registered",
        seed: null,
        botStyle: null,
        // Null for bots; a human carries the account the match rows are keyed by.
        accountId: player.id,
      },
    ]);
  });

  it("does not freeze the deck at registration — the snapshot is empty until check-in closes", async () => {
    const { store, participants } = fixture;
    const player = await createPlayer(store, "Alice");
    const deckId = await saveLegalDeck(store, player.id);
    const tournamentId = await createTournament(store, player.id);
    await participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 });
    const [record] = await participants.participants(tournamentId);
    expect(record).toMatchObject({ savedDeckId: deckId, deckSnapshot: null, deckVersion: null });
  });

  it("rejects a second registration by the same account", async () => {
    const { store, participants } = fixture;
    const player = await createPlayer(store, "Alice");
    const deckId = await saveLegalDeck(store, player.id);
    const tournamentId = await createTournament(store, player.id);
    await participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 });
    expect(await participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 })).toEqual({
      ok: false,
      reason: "already_registered",
    });
    expect(await participants.participants(tournamentId)).toHaveLength(1);
  });

  it("rejects a deck the account does not own", async () => {
    const { store, participants } = fixture;
    const player = await createPlayer(store, "Alice");
    const other = await createPlayer(store, "Bob");
    const otherDeckId = await saveLegalDeck(store, other.id);
    const tournamentId = await createTournament(store, player.id);
    expect(
      await participants.register({ tournamentId, accountId: player.id, savedDeckId: otherDeckId, now: T0 }),
    ).toEqual({ ok: false, reason: "deck_not_found" });
  });

  it("rejects registration after the registration window closes", async () => {
    const { store, participants } = fixture;
    const player = await createPlayer(store, "Alice");
    const deckId = await saveLegalDeck(store, player.id);
    const tournamentId = await createTournament(store, player.id);
    await participants.setWindows(tournamentId, { registrationClosesAt: T0 });
    expect(
      await participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 + 1 }),
    ).toEqual({ ok: false, reason: "registration_closed" });
  });

  it("frees the slot again when a registered player drops", async () => {
    const { store, participants } = fixture;
    const alice = await createPlayer(store, "Alice");
    const bob = await createPlayer(store, "Bob");
    const aliceDeck = await saveLegalDeck(store, alice.id);
    const bobDeck = await saveLegalDeck(store, bob.id);
    const tournamentId = await createTournament(store, alice.id, 1);
    await participants.register({ tournamentId, accountId: alice.id, savedDeckId: aliceDeck, now: T0 });
    expect(await participants.register({ tournamentId, accountId: bob.id, savedDeckId: bobDeck, now: T0 })).toEqual({
      ok: false,
      reason: "tournament_full",
    });
    await participants.drop({ tournamentId, accountId: alice.id, now: T0 + 1 });
    expect(
      (await participants.register({ tournamentId, accountId: bob.id, savedDeckId: bobDeck, now: T0 + 2 })).ok,
    ).toBe(true);
  });
});

/**
 * pg-mem has no row locks, so it cannot reproduce two transactions racing for the last slot the
 * way Postgres would — the `FOR UPDATE` in `register()` is the guarantee that keeps two API
 * containers honest against one database, and that contract belongs to the database.
 *
 * What these tests prove is the half a test can observe: with the in-process lock, two overlapping
 * registrations for one slot resolve to exactly one winner; without it, the same pair double-books.
 * Same split as `migratorLock.test.ts`.
 */
describe("ParticipantStore last-slot contention", () => {
  async function raceForOneSlot(lock?: AcquireTournamentLock) {
    const pool = createMemoryPool();
    const store = new AccountStore(pool as never);
    const participants = new ParticipantStore(store, lock);
    const alice = await createPlayer(store, "Alice");
    const bob = await createPlayer(store, "Bob");
    const aliceDeck = await saveLegalDeck(store, alice.id);
    const bobDeck = await saveLegalDeck(store, bob.id, BLUE_DECK);
    const tournamentId = await createTournament(store, alice.id, 1);
    const results = await Promise.all([
      participants.register({ tournamentId, accountId: alice.id, savedDeckId: aliceDeck, now: T0 }),
      participants.register({ tournamentId, accountId: bob.id, savedDeckId: bobDeck, now: T0 }),
    ]);
    return { results, seated: await participants.participants(tournamentId) };
  }

  it("gives the last slot to exactly one of two concurrent registrations", async () => {
    const { results, seated } = await raceForOneSlot();
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "tournament_full" }]);
    expect(seated).toHaveLength(1);
  });

  it("characterizes an unserialized race as the double-booking the lock prevents", async () => {
    const noLock: AcquireTournamentLock = async () => () => undefined;
    const { results, seated } = await raceForOneSlot(noLock);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(seated).toHaveLength(2);
  });
});

describe("ParticipantStore check-in", () => {
  let fixture: Fixture;
  let tournamentId: string;
  let player: Account;
  let deckId: string;
  beforeEach(async () => {
    fixture = await createMigratedFixture();
    player = await createPlayer(fixture.store, "Alice");
    deckId = await saveLegalDeck(fixture.store, player.id);
    tournamentId = await createTournament(fixture.store, player.id);
    await fixture.participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 });
  });

  it("checks a registered player in inside the window", async () => {
    const { participants } = fixture;
    await participants.setWindows(tournamentId, { checkInOpensAt: T0, checkInClosesAt: T0 + 100 });
    const result = await participants.checkIn({ tournamentId, accountId: player.id, now: T0 + 50 });
    expect(result).toMatchObject({ ok: true, value: { status: "checked_in", checkedInAt: T0 + 50 } });
  });

  it("rejects a check-in before the window opens and after it closes", async () => {
    const { participants } = fixture;
    await participants.setWindows(tournamentId, { checkInOpensAt: T0 + 10, checkInClosesAt: T0 + 20 });
    expect(await participants.checkIn({ tournamentId, accountId: player.id, now: T0 + 9 })).toEqual({
      ok: false,
      reason: "check_in_not_open",
    });
    expect(await participants.checkIn({ tournamentId, accountId: player.id, now: T0 + 21 })).toEqual({
      ok: false,
      reason: "check_in_closed",
    });
  });

  // The window is closed at both ends: a player arriving on the stroke of the opening time is in,
  // and one arriving on the stroke of the closing time is still in. Only past it is late.
  it("admits a check-in at exactly the opening instant", async () => {
    const { participants } = fixture;
    await participants.setWindows(tournamentId, { checkInOpensAt: T0 + 10, checkInClosesAt: T0 + 20 });
    expect((await participants.checkIn({ tournamentId, accountId: player.id, now: T0 + 10 })).ok).toBe(true);
  });

  it("admits a check-in at exactly the closing instant", async () => {
    const { participants } = fixture;
    await participants.setWindows(tournamentId, { checkInOpensAt: T0 + 10, checkInClosesAt: T0 + 20 });
    expect((await participants.checkIn({ tournamentId, accountId: player.id, now: T0 + 20 })).ok).toBe(true);
  });

  it("admits a registration at exactly the registration deadline", async () => {
    const { store, participants } = fixture;
    const latecomer = await createPlayer(store, "Latecomer");
    const latecomerDeckId = await saveLegalDeck(store, latecomer.id, BLUE_DECK);
    await participants.setWindows(tournamentId, { registrationClosesAt: T0 + 10 });
    expect(
      (
        await participants.register({
          tournamentId,
          accountId: latecomer.id,
          savedDeckId: latecomerDeckId,
          now: T0 + 10,
        })
      ).ok,
    ).toBe(true);
  });

  it("rejects a schedule whose parts cannot happen in order", async () => {
    const { participants } = fixture;
    await expect(
      participants.setWindows(tournamentId, { checkInOpensAt: T0 + 20, checkInClosesAt: T0 + 10 }),
    ).rejects.toThrow(/check_in_window_inverted/);
    expect(await participants.windows(tournamentId)).toEqual({
      registrationClosesAt: null,
      checkInOpensAt: null,
      checkInClosesAt: null,
    });
  });

  it("lets a latecomer register and check in while check-in is already open", async () => {
    const { store, participants } = fixture;
    const latecomer = await createPlayer(store, "Latecomer");
    const latecomerDeckId = await saveLegalDeck(store, latecomer.id, BLUE_DECK);
    expect(
      await participants.setWindows(tournamentId, {
        registrationClosesAt: T0 + 30,
        checkInOpensAt: T0 + 10,
        checkInClosesAt: T0 + 30,
      }),
    ).toBe(true);
    expect(
      (
        await participants.register({
          tournamentId,
          accountId: latecomer.id,
          savedDeckId: latecomerDeckId,
          now: T0 + 25,
        })
      ).ok,
    ).toBe(true);
    expect((await participants.checkIn({ tournamentId, accountId: latecomer.id, now: T0 + 26 })).ok).toBe(true);
  });

  it("accepts a schedule that merely touches at the boundaries", async () => {
    const { participants } = fixture;
    expect(
      await participants.setWindows(tournamentId, {
        registrationClosesAt: T0 + 10,
        checkInOpensAt: T0 + 10,
        checkInClosesAt: T0 + 10,
      }),
    ).toBe(true);
  });

  it("rejects a second check-in", async () => {
    const { participants } = fixture;
    await participants.checkIn({ tournamentId, accountId: player.id, now: T0 });
    expect(await participants.checkIn({ tournamentId, accountId: player.id, now: T0 + 1 })).toEqual({
      ok: false,
      reason: "already_checked_in",
    });
  });

  it("rejects a check-in from an account that never registered", async () => {
    const { store, participants } = fixture;
    const stranger = await createPlayer(store, "Stranger");
    expect(await participants.checkIn({ tournamentId, accountId: stranger.id, now: T0 })).toEqual({
      ok: false,
      reason: "not_registered",
    });
  });

  it("rejects a repeated drop", async () => {
    const { participants } = fixture;
    expect(await participants.drop({ tournamentId, accountId: player.id, now: T0 })).toMatchObject({
      ok: true,
      value: { status: "dropped", droppedAt: T0 },
    });
    expect(await participants.drop({ tournamentId, accountId: player.id, now: T0 + 1 })).toEqual({
      ok: false,
      reason: "already_dropped",
    });
  });

  it("keeps the windows across a restart, because they live in the database", async () => {
    const { pool, participants } = fixture;
    await participants.setWindows(tournamentId, {
      registrationClosesAt: T0 + 1,
      checkInOpensAt: T0 + 2,
      checkInClosesAt: T0 + 3,
    });
    const restarted = createFixture(pool);
    expect(await restarted.participants.windows(tournamentId)).toEqual({
      registrationClosesAt: T0 + 1,
      checkInOpensAt: T0 + 2,
      checkInClosesAt: T0 + 3,
    });
    expect(await restarted.participants.checkIn({ tournamentId, accountId: player.id, now: T0 + 4 })).toEqual({
      ok: false,
      reason: "check_in_closed",
    });
  });
});

describe("ParticipantStore tournament status gate", () => {
  async function seedRegistered(status?: string) {
    const fixture = createFixture();
    const player = await createPlayer(fixture.store, "Alice");
    const deckId = await saveLegalDeck(fixture.store, player.id);
    const tournamentId = await createTournament(fixture.store, player.id);
    await fixture.participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 });
    if (status) await fixture.pool.query("UPDATE tournaments SET status=$1 WHERE id=$2", [status, tournamentId]);
    return { ...fixture, player, deckId, tournamentId };
  }

  it("refuses registration once the tournament has left the registration phase", async () => {
    for (const status of ["in_progress", "finished"]) {
      const { store, participants, tournamentId } = await seedRegistered(status);
      const latecomer = await createPlayer(store, `Late${status}`);
      const deckId = await saveLegalDeck(store, latecomer.id, BLUE_DECK);
      expect(
        await participants.register({ tournamentId, accountId: latecomer.id, savedDeckId: deckId, now: T0 }),
      ).toEqual({ ok: false, reason: "registration_closed" });
    }
  });

  it("refuses check-in once the tournament has started, even with no window set", async () => {
    const { participants, player, tournamentId } = await seedRegistered("in_progress");
    expect(await participants.checkIn({ tournamentId, accountId: player.id, now: T0 })).toEqual({
      ok: false,
      reason: "check_in_closed",
    });
  });

  it("refuses to freeze the field of a tournament that is already running", async () => {
    const { participants, tournamentId } = await seedRegistered("in_progress");
    expect(await participants.closeCheckIn({ tournamentId, now: T0 })).toEqual({
      ok: false,
      reason: "check_in_closed",
    });
  });

  it("refuses to re-register a disqualified account, because a ruling is not a withdrawal", async () => {
    const { store, participants, player, deckId, tournamentId } = await seedRegistered();
    await participants.checkIn({ tournamentId, accountId: player.id, now: T0 + 1 });
    await store.saveDeck(player.id, {
      id: deckId,
      name: "Illegal",
      mainDeck: [...RED_DECK.mainDeck.slice(0, 49)],
      eggDeck: [...RED_DECK.eggDeck],
    });
    await participants.closeCheckIn({ tournamentId, now: T0 + 2 });
    await store.saveDeck(player.id, {
      id: deckId,
      name: "Legal again",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
    });
    // The tournament is still in its registration phase — freezing the field does not advance it —
    // so this refusal is the disqualification itself, not the phase gate.
    expect(
      await participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 + 3 }),
    ).toEqual({ ok: false, reason: "disqualified" });
  });
});

describe("ParticipantStore deck freeze", () => {
  it("freezes the selected printings and keeps them after the saved deck changes", async () => {
    const { store, participants } = createFixture();
    const player = await createPlayer(store, "Arts");
    const mainDeckArts = RED_DECK.mainDeck.map((cardId) => getCardArts(cardId).at(-1)!.artId);
    const deck = await store.saveDeck(player.id, {
      name: "Selected arts",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
      mainDeckArts,
    });
    const tournamentId = await createTournament(store, player.id);
    await participants.register({ tournamentId, accountId: player.id, savedDeckId: deck.id, now: T0 });
    await participants.checkIn({ tournamentId, accountId: player.id, now: T0 + 1 });
    await participants.closeCheckIn({ tournamentId, now: T0 + 2 });
    expect((await participants.participants(tournamentId))[0]!.deckSnapshot!.mainDeckArts).toEqual(mainDeckArts);
    await store.saveDeck(player.id, { ...deck, mainDeckArts: [...RED_DECK.mainDeck] });
    expect((await participants.participants(tournamentId))[0]!.deckSnapshot!.mainDeckArts).toEqual(mainDeckArts);
  });

  it("freezes the checked-in player's deck and ignores every later edit to the saved deck", async () => {
    const { store, participants } = createFixture();
    const player = await createPlayer(store, "Alice");
    const deckId = await saveLegalDeck(store, player.id);
    const tournamentId = await createTournament(store, player.id);
    await participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 });
    await participants.checkIn({ tournamentId, accountId: player.id, now: T0 + 1 });
    await participants.closeCheckIn({ tournamentId, now: T0 + 2 });

    const [frozen] = await participants.participants(tournamentId);
    expect(frozen).toMatchObject({ status: "active" });
    expect(frozen!.deckSnapshot!.mainDeck).toEqual([...RED_DECK.mainDeck]);
    expect(frozen!.deckVersion).toMatch(/^r1-[0-9a-f]{16}$/);

    await store.saveDeck(player.id, {
      id: deckId,
      name: "Rebuilt",
      mainDeck: [...BLUE_DECK.mainDeck],
      eggDeck: [...BLUE_DECK.eggDeck],
    });
    const [afterEdit] = await participants.participants(tournamentId);
    expect(afterEdit!.deckSnapshot).toEqual(frozen!.deckSnapshot);
    expect(afterEdit!.deckVersion).toBe(frozen!.deckVersion);
  });

  it("drops the players who never checked in", async () => {
    const { store, participants } = createFixture();
    const alice = await createPlayer(store, "Alice");
    const bob = await createPlayer(store, "Bob");
    const tournamentId = await createTournament(store, alice.id);
    for (const player of [alice, bob])
      await participants.register({
        tournamentId,
        accountId: player.id,
        savedDeckId: await saveLegalDeck(store, player.id),
        now: T0,
      });
    await participants.checkIn({ tournamentId, accountId: alice.id, now: T0 + 1 });
    await participants.closeCheckIn({ tournamentId, now: T0 + 2 });

    const byName = new Map((await participants.participants(tournamentId)).map((p) => [p.displayName, p]));
    expect(byName.get("Alice")).toMatchObject({ status: "active" });
    expect(byName.get("Bob")).toMatchObject({ status: "dropped", droppedAt: T0 + 2, deckSnapshot: null });
  });

  /**
   * Pins the in-transaction re-read: the field is selected under the same lock and transaction as
   * the writes, so a drop that landed after check-in is seen and the player stays dropped rather
   * than being resurrected as `active`. Moving the drop earlier — to before `closeCheckIn` is
   * called — is as close as pg-mem gets to another container's commit, since it cannot interleave
   * two transactions.
   *
   * The `AND status=...` on each write is the second half of the same guarantee, for a change that
   * commits while this transaction is open. Nothing here can produce that, so this test does not
   * prove it; the row lock and the guard are what make it hold on Postgres.
   */
  it("does not resurrect a participant who dropped before the field was frozen", async () => {
    const { pool, store, participants } = createFixture();
    const player = await createPlayer(store, "Alice");
    const deckId = await saveLegalDeck(store, player.id);
    const tournamentId = await createTournament(store, player.id);
    await participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 });
    await participants.checkIn({ tournamentId, accountId: player.id, now: T0 + 1 });
    await pool.query("UPDATE tournament_participants SET status='dropped', dropped_at=$1 WHERE account_id=$2", [
      T0 + 2,
      player.id,
    ]);

    const result = await participants.closeCheckIn({ tournamentId, now: T0 + 3 });
    expect(result).toEqual({ ok: true, value: [] });
    expect(await participants.participants(tournamentId)).toMatchObject([
      { status: "dropped", droppedAt: T0 + 2, deckSnapshot: null },
    ]);
  });

  it("reports exactly the participants it moved", async () => {
    const { store, participants } = createFixture();
    const alice = await createPlayer(store, "Alice");
    const bob = await createPlayer(store, "Bob");
    const tournamentId = await createTournament(store, alice.id);
    for (const player of [alice, bob])
      await participants.register({
        tournamentId,
        accountId: player.id,
        savedDeckId: await saveLegalDeck(store, player.id),
        now: T0,
      });
    await participants.checkIn({ tournamentId, accountId: alice.id, now: T0 + 1 });
    await participants.drop({ tournamentId, accountId: bob.id, now: T0 + 1 });

    const result = await participants.closeCheckIn({ tournamentId, now: T0 + 2 });
    expect(result.ok && result.value.map((record) => [record.displayName, record.status])).toEqual([
      ["Alice", "active"],
    ]);
  });

  it("disqualifies a player whose deck became illegal between registration and the freeze", async () => {
    const { store, participants } = createFixture();
    const player = await createPlayer(store, "Alice");
    const deckId = await saveLegalDeck(store, player.id);
    const tournamentId = await createTournament(store, player.id);
    await participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 });
    await participants.checkIn({ tournamentId, accountId: player.id, now: T0 + 1 });
    await store.saveDeck(player.id, {
      id: deckId,
      name: "Illegal",
      mainDeck: [...RED_DECK.mainDeck.slice(0, 49)],
      eggDeck: [...RED_DECK.eggDeck],
    });
    await participants.closeCheckIn({ tournamentId, now: T0 + 2 });

    const [record] = await participants.participants(tournamentId);
    expect(record).toMatchObject({ status: "disqualified" });
    expect(record!.deckSnapshot!.mainDeck).toHaveLength(49);
  });
});

describe("ParticipantStore banlist enforcement", () => {
  it("treats a missing banlist column as no restrictions", async () => {
    const { store, participants } = createFixture();
    const player = await createPlayer(store, "Alice");
    const deckId = await saveLegalDeck(store, player.id);
    const tournamentId = await createTournament(store, player.id);
    expect(await participants.banlistCards(tournamentId)).toEqual([]);
    expect((await participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 })).ok).toBe(
      true,
    );
  });

  it("rejects a deck that breaks the tournament's frozen banlist", async () => {
    const { pool, store, participants } = createFixture();
    const player = await createPlayer(store, "Alice");
    const deckId = await saveLegalDeck(store, player.id);
    const tournamentId = await createTournament(store, player.id);
    await addBanlistColumn(pool, tournamentId, [{ cardId: RED_DECK.mainDeck[0]!, status: "banned", allowedCopies: 0 }]);
    const result = await participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 });
    expect(result).toMatchObject({ ok: false, reason: "deck_illegal" });
    expect(result.ok ? [] : result.violations).toContainEqual({ kind: "banned", cardId: RED_DECK.mainDeck[0]! });
  });

  it("accepts the same deck when the tournament froze an empty banlist", async () => {
    const { pool, store, participants } = createFixture();
    const player = await createPlayer(store, "Alice");
    const deckId = await saveLegalDeck(store, player.id);
    const tournamentId = await createTournament(store, player.id);
    await addBanlistColumn(pool, tournamentId, []);
    expect((await participants.register({ tournamentId, accountId: player.id, savedDeckId: deckId, now: T0 })).ok).toBe(
      true,
    );
  });

  it("propagates a read failure instead of running the event with no restrictions", async () => {
    const pool = createMemoryPool();
    const { store, participants } = createFixture(pool);
    const player = await createPlayer(store, "Alice");
    const tournamentId = await createTournament(store, player.id);
    await addBanlistColumn(pool, tournamentId, []);

    const query = pool.query.bind(pool);
    Object.assign(pool, {
      query: (...args: Parameters<typeof query>) =>
        String(args[0]).includes("banlist_cards") && !String(args[0]).includes("information_schema")
          ? Promise.reject(new Error("connection terminated unexpectedly"))
          : query(...args),
    });
    await expect(participants.banlistCards(tournamentId)).rejects.toThrow("connection terminated unexpectedly");
  });
});
