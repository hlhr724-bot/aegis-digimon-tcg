import { createMemoryDatabase } from "#api/db/createMemoryDatabase";
import { TrophyStore } from "#api/achievements/TrophyStore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Account, AccountStore, type TournamentMatch } from "./AccountStore.js";

// Characterization tests: they pin the tournament MVP exactly as it behaves today, including
// the rough edges called out as `characterizes` — those describe current behavior, not intent.

function createStore(): AccountStore {
  const adapter = createMemoryDatabase().adapters.createPg();
  return new AccountStore(new adapter.Pool() as never);
}

async function createPlayers(store: AccountStore, count: number): Promise<Account[]> {
  const players: Account[] = [];
  for (let index = 0; index < count; index++)
    players.push(await store.accountForIdentity("discord", `player-${index}`, `Player ${index}`));
  return players;
}

async function startTournament(
  store: AccountStore,
  playerCount: number,
  maxPlayers = 128,
): Promise<{ id: string; players: Account[] }> {
  const players = await createPlayers(store, playerCount);
  const tournament = await store.createTournament(players[0]!.id, {
    name: "Characterization Cup",
    block: "BT10",
    startsAt: Date.now(),
    maxPlayers,
  });
  await registerInArrivalOrder(store, tournament.id, players);
  await store.startTournament(tournament.id, players[0]!.id);
  return { id: tournament.id, players };
}

/**
 * Seeding reads `ORDER BY created_at, account_id`, and `created_at` is a millisecond clock, so
 * registrations that land in the same millisecond tie and fall back to a random uuid. Advancing
 * the clock once per registration gives every player a distinct `created_at`, which is the only
 * way arrival order is actually observable. The tie itself is characterized separately below.
 */
async function registerInArrivalOrder(store: AccountStore, tournamentId: string, players: Account[]): Promise<void> {
  let clock = Date.now();
  const now = vi.spyOn(Date, "now").mockImplementation(() => ++clock);
  try {
    for (const player of players) await store.registerTournament(tournamentId, player.id);
  } finally {
    now.mockRestore();
  }
}

function slots(match: TournamentMatch): [string | null, string | null, TournamentMatch["status"]] {
  return [match.player0AccountId, match.player1AccountId, match.status];
}

function round(matches: TournamentMatch[], number: number): TournamentMatch[] {
  return matches.filter((match) => match.round === number);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AccountStore tournament bracket generation", () => {
  it("sizes the bracket to the next power of two and seeds by registration order", async () => {
    const store = createStore();
    const { id, players } = await startTournament(store, 5);
    const matches = await store.tournamentMatches(id);
    expect(round(matches, 1)).toHaveLength(4);
    expect(round(matches, 2)).toHaveLength(2);
    expect(round(matches, 3)).toHaveLength(1);
    expect(round(matches, 1).map(slots)).toEqual([
      [players[0]!.id, null, "bye"],
      [players[1]!.id, null, "bye"],
      [players[2]!.id, null, "bye"],
      [players[3]!.id, players[4]!.id, "pending"],
    ]);
    expect(round(matches, 2).map(slots)).toEqual([
      [players[0]!.id, players[1]!.id, "pending"],
      [players[2]!.id, null, "waiting"],
    ]);
    expect(round(matches, 3).map(slots)).toEqual([[null, null, "waiting"]]);
    await store.close();
  });

  it("pairs the first and last registrations when the field is already a power of two", async () => {
    const store = createStore();
    const { id, players } = await startTournament(store, 4);
    expect(round(await store.tournamentMatches(id), 1).map(slots)).toEqual([
      [players[0]!.id, players[3]!.id, "pending"],
      [players[1]!.id, players[2]!.id, "pending"],
    ]);
    await store.close();
  });

  it("characterizes same-millisecond registrations as seeded by account id, not by arrival", async () => {
    const store = createStore();
    const players = await createPlayers(store, 4);
    const frozen = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(frozen);
    const tournament = await store.createTournament(players[0]!.id, {
      name: "Tied Cup",
      block: "BT10",
      startsAt: frozen,
      maxPlayers: 8,
    });
    for (const player of [...players].reverse()) await store.registerTournament(tournament.id, player.id);
    await store.startTournament(tournament.id, players[0]!.id);
    const byId = [...players].map((player) => player.id).sort();
    expect(round(await store.tournamentMatches(tournament.id), 1).map(slots)).toEqual([
      [byId[0], byId[3], "pending"],
      [byId[1], byId[2], "pending"],
    ]);
    await store.close();
  });

  it("characterizes byes as advancing without ever recording a winner", async () => {
    const store = createStore();
    const { id, players } = await startTournament(store, 3);
    const matches = await store.tournamentMatches(id);
    const bye = round(matches, 1).find((match) => match.status === "bye")!;
    expect(bye.winnerAccountId).toBeNull();
    expect(bye.status).toBe("bye");
    expect(round(matches, 2)[0]!.player0AccountId).toBe(players[0]!.id);
    await store.close();
  });

  it("counts every registration as a tournament played once the bracket is built", async () => {
    const store = createStore();
    const { players } = await startTournament(store, 3);
    for (const player of players) expect((await store.profile(player.id)).stats.tournamentsPlayed).toBe(1);
    await store.close();
  });

  it("starts only for the organizer, only once, and only with at least two registrations", async () => {
    const store = createStore();
    const players = await createPlayers(store, 3);
    const tournament = await store.createTournament(players[0]!.id, {
      name: "Guarded Cup",
      block: "BT10",
      startsAt: Date.now(),
      maxPlayers: 8,
    });
    await store.registerTournament(tournament.id, players[0]!.id);
    expect(await store.startTournament(tournament.id, players[0]!.id)).toBe(false);
    await store.registerTournament(tournament.id, players[1]!.id);
    expect(await store.startTournament(tournament.id, players[1]!.id)).toBe(false);
    expect(await store.startTournament(tournament.id, players[0]!.id)).toBe(true);
    expect(await store.startTournament(tournament.id, players[0]!.id)).toBe(false);
    expect((await store.tournament(tournament.id))?.status).toBe("in_progress");
    await store.close();
  });
});

describe("AccountStore tournament registration", () => {
  it("enforces capacity, rejects duplicates, and closes once the bracket starts", async () => {
    const store = createStore();
    const players = await createPlayers(store, 3);
    const tournament = await store.createTournament(players[0]!.id, {
      name: "Small Cup",
      block: "BT10",
      startsAt: Date.now(),
      maxPlayers: 2,
    });
    expect(await store.registerTournament(tournament.id, players[0]!.id)).toBe(true);
    expect(await store.registerTournament(tournament.id, players[0]!.id)).toBe(false);
    expect(await store.registerTournament(tournament.id, players[1]!.id)).toBe(true);
    expect(await store.registerTournament(tournament.id, players[2]!.id)).toBe(false);
    expect((await store.tournament(tournament.id))?.registrations).toBe(2);
    await store.startTournament(tournament.id, players[0]!.id);
    expect(await store.registerTournament(tournament.id, players[2]!.id)).toBe(false);
    await store.close();
  });

  it("rejects registration for an unknown tournament", async () => {
    const store = createStore();
    const [player] = await createPlayers(store, 1);
    expect(await store.registerTournament("00000000-0000-0000-0000-000000000000", player!.id)).toBe(false);
    await store.close();
  });
});

describe("AccountStore room tickets", () => {
  it("consumes a room ticket exactly once", async () => {
    const store = createStore();
    const [player] = await createPlayers(store, 1);
    const token = await store.createRoomTicket(player!.id);
    expect(await store.consumeRoomTicket(token)).toEqual({ account: player, tournamentMatchId: null });
    expect(await store.consumeRoomTicket(token)).toBeUndefined();
    expect(await store.consumeRoomTicket(undefined)).toBeUndefined();
    await store.close();
  });

  it("expires a room ticket after one minute", async () => {
    const store = createStore();
    const [player] = await createPlayers(store, 1);
    const token = await store.createRoomTicket(player!.id);
    const issuedAt = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(issuedAt + 60_001);
    expect(await store.consumeRoomTicket(token)).toBeUndefined();
    await store.close();
  });

  it("issues match tickets only to the two players of a pending match", async () => {
    const store = createStore();
    const { id, players } = await startTournament(store, 3);
    const matches = await store.tournamentMatches(id);
    const pending = matches.find((match) => match.status === "pending")!;
    const bye = matches.find((match) => match.status === "bye")!;
    const outsider = await store.accountForIdentity("discord", "outsider", "Outsider");
    expect(await store.createTournamentMatchTicket(outsider.id, id, pending.id)).toBeUndefined();
    expect(await store.createTournamentMatchTicket(bye.player0AccountId!, id, bye.id)).toBeUndefined();
    expect(
      await store.createTournamentMatchTicket(players[0]!.id, id, "00000000-0000-0000-0000-000000000000"),
    ).toBeUndefined();
    const token = await store.createTournamentMatchTicket(pending.player0AccountId!, id, pending.id);
    expect(await store.consumeRoomTicket(token!)).toEqual({
      account: expect.objectContaining({ id: pending.player0AccountId }),
      tournamentMatchId: pending.id,
    });
    await store.close();
  });
});

describe("AccountStore tournament room claim", () => {
  it("claims a pending match for one room and is idempotent for that same room", async () => {
    const store = createStore();
    const { id } = await startTournament(store, 4);
    const match = (await store.tournamentMatches(id))[0]!;
    expect(await store.claimTournamentRoom(match.id, "room-1")).toBe(true);
    expect(await store.claimTournamentRoom(match.id, "room-1")).toBe(true);
    expect(await store.claimTournamentRoom(match.id, "room-2")).toBe(false);
    await store.close();
  });

  it("releases a claim only for the holding room while the match is pending", async () => {
    const store = createStore();
    const { id } = await startTournament(store, 4);
    const match = (await store.tournamentMatches(id))[0]!;
    await store.claimTournamentRoom(match.id, "room-1");
    await store.releaseTournamentRoom(match.id, "room-2");
    expect(await store.claimTournamentRoom(match.id, "room-2")).toBe(false);
    await store.releaseTournamentRoom(match.id, "room-1");
    expect(await store.claimTournamentRoom(match.id, "room-2")).toBe(true);
    await store.close();
  });

  it("refuses to claim a bye, a waiting, or a finished match", async () => {
    const store = createStore();
    const { id } = await startTournament(store, 3);
    const matches = await store.tournamentMatches(id);
    expect(await store.claimTournamentRoom(matches.find((match) => match.status === "bye")!.id, "room-1")).toBe(false);
    expect(await store.claimTournamentRoom(matches.find((match) => match.status === "waiting")!.id, "room-1")).toBe(
      false,
    );
    const pending = matches.find((match) => match.status === "pending")!;
    await store.claimTournamentRoom(pending.id, "room-2");
    await store.recordTournamentRoomResult(
      pending.id,
      "room-2",
      [pending.player0AccountId!, pending.player1AccountId!],
      pending.player0AccountId!,
      "security",
    );
    expect(await store.claimTournamentRoom(pending.id, "room-3")).toBe(false);
    await store.close();
  });
});

describe("AccountStore tournament draws", () => {
  it("records a draw, keeps the match pending, and frees the room for a replay", async () => {
    const store = createStore();
    const { id } = await startTournament(store, 4);
    const match = (await store.tournamentMatches(id))[0]!;
    const pair: [string, string] = [match.player0AccountId!, match.player1AccountId!];
    await store.claimTournamentRoom(match.id, "room-1");
    expect(await store.recordTournamentRoomDraw(match.id, "room-1", pair, "time")).toBe(true);
    const replayed = (await store.tournamentMatches(id)).find((item) => item.id === match.id)!;
    expect(replayed.status).toBe("pending");
    expect(replayed.winnerAccountId).toBeNull();
    expect((await store.profile(pair[0])).stats.tournamentDraws).toBe(1);
    expect(await store.claimTournamentRoom(match.id, "room-2")).toBe(true);
    expect(await store.recordTournamentRoomResult(match.id, "room-2", pair, pair[0], "security")).toBe(true);
    await store.close();
  });

  it("characterizes a replay under the drawn room id as a silent failure that keeps the room claimed", async () => {
    const store = createStore();
    const { id } = await startTournament(store, 4);
    const match = (await store.tournamentMatches(id))[0]!;
    const pair: [string, string] = [match.player0AccountId!, match.player1AccountId!];
    await store.claimTournamentRoom(match.id, "room-1");
    await store.recordTournamentRoomDraw(match.id, "room-1", pair, "time");
    expect(await store.claimTournamentRoom(match.id, "room-1")).toBe(true);
    expect(await store.recordTournamentRoomResult(match.id, "room-1", pair, pair[0], "security")).toBe(false);
    expect((await store.tournamentMatches(id)).find((item) => item.id === match.id)?.status).toBe("pending");
    expect(await store.claimTournamentRoom(match.id, "room-2")).toBe(false);
    await store.close();
  });

  it("rejects a draw reported by a room that does not hold the claim or with the wrong pairing", async () => {
    const store = createStore();
    const { id, players } = await startTournament(store, 4);
    const match = (await store.tournamentMatches(id))[0]!;
    await store.claimTournamentRoom(match.id, "room-1");
    expect(
      await store.recordTournamentRoomDraw(
        match.id,
        "room-9",
        [match.player0AccountId!, match.player1AccountId!],
        "time",
      ),
    ).toBe(false);
    const stranger = players.find(
      (player) => player.id !== match.player0AccountId && player.id !== match.player1AccountId,
    )!;
    expect(
      await store.recordTournamentRoomDraw(match.id, "room-1", [match.player0AccountId!, stranger.id], "time"),
    ).toBe(false);
    await store.close();
  });
});

describe("AccountStore tournament results", () => {
  it("advances the winner into round+1 at floor(position/2) on the slot given by position parity", async () => {
    const store = createStore();
    const { id } = await startTournament(store, 4);
    const [first, second] = await store.tournamentMatches(id);
    await store.claimTournamentRoom(first!.id, "room-1");
    expect(
      await store.recordTournamentRoomResult(
        first!.id,
        "room-1",
        [first!.player0AccountId!, first!.player1AccountId!],
        first!.player1AccountId!,
        "security",
      ),
    ).toBe(true);
    const afterFirst = (await store.tournamentMatches(id)).find((match) => match.round === 2)!;
    expect(slots(afterFirst)).toEqual([first!.player1AccountId, null, "waiting"]);
    await store.claimTournamentRoom(second!.id, "room-2");
    await store.recordTournamentRoomResult(
      second!.id,
      "room-2",
      [second!.player0AccountId!, second!.player1AccountId!],
      second!.player0AccountId!,
      "security",
    );
    const afterSecond = (await store.tournamentMatches(id)).find((match) => match.round === 2)!;
    expect(slots(afterSecond)).toEqual([first!.player1AccountId, second!.player0AccountId, "pending"]);
    await store.close();
  });

  it("finishes the tournament on the final match and credits the champion", async () => {
    const store = createStore();
    const { id } = await startTournament(store, 2);
    const final = (await store.tournamentMatches(id))[0]!;
    await store.claimTournamentRoom(final.id, "room-1");
    expect(
      await store.recordTournamentRoomResult(
        final.id,
        "room-1",
        [final.player0AccountId!, final.player1AccountId!],
        final.player0AccountId!,
        "security",
      ),
    ).toBe(true);
    expect(await store.tournament(id)).toMatchObject({ status: "finished", winnerAccountId: final.player0AccountId });
    const champion = await store.profile(final.player0AccountId!);
    expect(champion.stats).toMatchObject({ tournamentsWon: 1, tournamentsPlayed: 1, tournamentWins: 1 });
    expect((await new TrophyStore(store).getTrophies(final.player0AccountId!)).items).toMatchObject([
      { award: "tournament_champion", tier: "gold", source: { tournamentId: id } },
    ]);
    expect((await new TrophyStore(store).getTrophies(final.player1AccountId!)).items).toMatchObject([
      { award: "tournament_top_four", tier: "silver" },
    ]);
    expect((await store.profile(final.player1AccountId!)).stats).toMatchObject({
      tournamentsWon: 0,
      tournamentLosses: 1,
    });
    await store.close();
  });

  it("rejects a result without a winner, for the wrong room, or with the wrong pairing", async () => {
    const store = createStore();
    const { id, players } = await startTournament(store, 4);
    const match = (await store.tournamentMatches(id))[0]!;
    const pair: [string, string] = [match.player0AccountId!, match.player1AccountId!];
    await store.claimTournamentRoom(match.id, "room-1");
    expect(await store.recordTournamentRoomResult(match.id, "room-1", pair, undefined, "draw")).toBe(false);
    expect(await store.recordTournamentRoomResult(match.id, "room-9", pair, pair[0], "security")).toBe(false);
    const stranger = players.find((player) => !pair.includes(player.id))!;
    expect(
      await store.recordTournamentRoomResult(match.id, "room-1", [pair[0], stranger.id], pair[0], "security"),
    ).toBe(false);
    await store.close();
  });

  it("rejects a duplicate result for an already finished match", async () => {
    const store = createStore();
    const { id } = await startTournament(store, 4);
    const match = (await store.tournamentMatches(id))[0]!;
    const pair: [string, string] = [match.player0AccountId!, match.player1AccountId!];
    await store.claimTournamentRoom(match.id, "room-1");
    expect(await store.recordTournamentRoomResult(match.id, "room-1", pair, pair[0], "security")).toBe(true);
    expect(await store.recordTournamentRoomResult(match.id, "room-1", pair, pair[1], "security")).toBe(false);
    const finished = (await store.tournamentMatches(id)).find((item) => item.id === match.id)!;
    expect(finished.winnerAccountId).toBe(pair[0]);
    expect((await store.profile(pair[1])).stats.tournamentWins).toBe(0);
    await store.close();
  });

  it("characterizes the winner slot as accepting a result reported with reversed player ids", async () => {
    const store = createStore();
    const { id } = await startTournament(store, 4);
    const match = (await store.tournamentMatches(id))[0]!;
    await store.claimTournamentRoom(match.id, "room-1");
    expect(
      await store.recordTournamentRoomResult(
        match.id,
        "room-1",
        [match.player1AccountId!, match.player0AccountId!],
        match.player0AccountId!,
        "security",
      ),
    ).toBe(true);
    await store.close();
  });
});

it("keeps cancelled legacy tournaments closed to tickets, room claims and late results", async () => {
  const store = createStore();
  try {
    const { id, players } = await startTournament(store, 2);
    const match = (await store.tournamentMatches(id)).find((entry) => entry.status === "pending")!;
    expect(await store.claimTournamentRoom(match.id, "already-playing")).toBe(true);
    await store.pool.query("UPDATE tournaments SET status='cancelled' WHERE id=$1", [id]);
    expect(await store.createTournamentMatchTicket(players[0]!.id, id, match.id)).toBeUndefined();
    expect(await store.claimTournamentRoom(match.id, "already-playing")).toBe(false);
    const ids: [string, string] = [match.player0AccountId!, match.player1AccountId!];
    expect(await store.recordTournamentRoomResult(match.id, "already-playing", ids, ids[0], "surrender")).toBe(false);
    expect(await store.recordTournamentRoomDraw(match.id, "already-playing", ids, "timeout")).toBe(false);
    expect((await store.tournament(id))?.status).toBe("cancelled");
  } finally {
    await store.close();
  }
});
