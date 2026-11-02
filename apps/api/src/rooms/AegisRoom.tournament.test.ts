import { randomUUID } from "node:crypto";
import { CloseCode, type Client } from "colyseus";
import type { Seat, ServerEvent } from "@aegis/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "../accounts/AccountStore.js";
import type { Pool } from "pg";
import { snapshotFixtures } from "../db/snapshotFixture.js";
import { inProcessTournamentLock } from "../tournaments/participants/index.js";
import { SeriesStore, type SeriesRecord } from "../tournaments/series/index.js";
import { BLUE_DECK, RED_DECK } from "../engine/testDecks.js";
import { AegisRoom, type AegisJoinOptions } from "./AegisRoom.js";

/**
 * The tournament half of the room contract (slice 3). AegisRoom is instantiated directly and
 * driven through its lifecycle hooks, exactly as `AegisRoom.test.ts` does; the only substitution is
 * the series module, which is a real {@link SeriesStore} over pg-mem rather than the process
 * singleton.
 *
 * What these prove is the room's whole job for a Tournament Game: validate one authorization, run
 * one game, report one result. Every assertion about what happens NEXT — the score, the second
 * game, the deadline — is read back out of the series module, because the room never decides it.
 */

const SERIES_DURATION_MS = 2_700_000;
const START = 1_000_000;

let store: SeriesStore;
let accounts: AccountStore;
let alice: string;
let bob: string;
let matchId: string;
let tournamentId: string;

/** The competitive deck each participant froze; a tournament game may be played with no other. */
const FROZEN_DECK = {
  deckId: "frozen",
  name: "Frozen Deck",
  mainDeck: [...RED_DECK.mainDeck],
  eggDeck: [...RED_DECK.eggDeck],
  revision: 1,
};

/** What a dishonest client sends instead. It must never reach the engine. */
const CLIENT_SUPPLIED_DECK = { mainDeck: [...BLUE_DECK.mainDeck], eggDeck: [...BLUE_DECK.eggDeck] };

/** A room wired to the test's stores instead of the process singletons. */
class TournamentTestRoom extends AegisRoom {
  protected override series(): SeriesStore {
    return store;
  }

  protected override accounts(): AccountStore {
    return accounts;
  }
}

function fakeClient(sessionId: string): Client {
  return { sessionId, send: vi.fn<() => void>(), view: undefined } as unknown as Client;
}

function makeRoom(roomId: string): TournamentTestRoom {
  const room = new TournamentTestRoom();
  room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
  (room as unknown as { roomId: string }).roomId = roomId;
  room.onCreate({ seed: 1, botRoom: false, tournamentRoom: true });
  return room;
}

async function startSeries(): Promise<SeriesRecord> {
  await store.markPresent({
    tournamentId,
    matchId,
    accountId: alice,
    winsRequired: 2,
    seriesDurationMs: SERIES_DURATION_MS,
    now: START,
  });
  const both = await store.markPresent({
    tournamentId,
    matchId,
    accountId: bob,
    winsRequired: 2,
    seriesDurationMs: SERIES_DURATION_MS,
    now: START,
  });
  if (!both.ok || !both.value.series) throw new Error("series did not start");
  return both.value.series;
}

async function authorize(seriesId: string, accountId: string): Promise<{ gameId: string; token: string }> {
  const issued = await store.authorizeNextGame({ seriesId, accountId, now: Date.now() });
  if (!issued.ok) throw new Error(`authorization failed: ${issued.reason}`);
  return { gameId: issued.value.gameId, token: issued.value.token };
}

function joinOptions(gameId: string, token: string): AegisJoinOptions {
  return {
    displayName: "ignored",
    deck: { ...CLIENT_SUPPLIED_DECK },
    tournamentGameId: gameId,
    tournamentGameToken: token,
  };
}

/** Seats both participants in the room, exactly as the matchmaker would. */
async function seatBoth(room: TournamentTestRoom, seriesId: string): Promise<{ gameId: string }> {
  const first = await authorize(seriesId, alice);
  const second = await authorize(seriesId, bob);
  for (const [index, credentials] of [first, second].entries()) {
    const client = fakeClient(`session-${index}`);
    const options = joinOptions(credentials.gameId, credentials.token);
    expect(await room.onAuth(client, options)).toBe(true);
    room.clients.push(client);
    room.onJoin(client, options);
  }
  return { gameId: first.gameId };
}

function reportGameOver(room: TournamentTestRoom, result: ServerEvent & { kind: "gameOver" }): Promise<void> {
  return (
    room as unknown as { recordAuthoritativeResult: (event: ServerEvent & { kind: "gameOver" }) => Promise<void> }
  ).recordAuthoritativeResult(result);
}

function won(winnerSeat: Seat): ServerEvent & { kind: "gameOver" } {
  return { kind: "gameOver", result: { outcome: "win", winnerSeat }, reason: "security" };
}

type Fixture = {
  accounts: AccountStore;
  store: SeriesStore;
  alice: string;
  bob: string;
  tournamentId: string;
  matchId: string;
};

/** One arrangement, built once and restored before each test. */
const fixtureFor = snapshotFixtures<Fixture>();

/**
 * Assigns the file's module-level bindings rather than shadowing them: the helpers below
 * (`createTournament`, `addHuman`, ...) read those bindings directly.
 */
async function buildFixture(pool: Pool): Promise<Fixture> {
  accounts = new AccountStore(pool);
  store = new SeriesStore(accounts, inProcessTournamentLock());
  alice = (await accounts.accountForIdentity("discord", "alice", "Alice")).id;
  bob = (await accounts.accountForIdentity("discord", "bob", "Bob")).id;
  const tournament = await accounts.createTournament(alice, {
    name: "Series Cup",
    block: "BT10",
    startsAt: START,
    maxPlayers: 8,
  });
  tournamentId = tournament.id;
  matchId = randomUUID();
  await accounts.pool.query(
    `INSERT INTO tournament_matches (id, tournament_id, round, position, player0_account_id, player1_account_id, status)
     VALUES ($1,$2,1,0,$3,$4,'pending')`,
    [matchId, tournamentId, alice, bob],
  );
  for (const [accountId, displayName] of [
    [alice, "Registered Alice"],
    [bob, "Registered Bob"],
  ] as const)
    await accounts.pool.query(
      `INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, status, deck_snapshot, created_at)
       VALUES ($1,$2,'human',$3,$4,'active',$5,1)`,
      [randomUUID(), tournamentId, accountId, displayName, JSON.stringify(FROZEN_DECK)],
    );
  return { accounts, store, alice, bob, tournamentId, matchId };
}

beforeEach(async () => {
  ({ accounts, store, alice, bob, tournamentId, matchId } = await fixtureFor("default", buildFixture));
});

describe("entering a Tournament Game room", () => {
  it("loads the event format from the authorized game instead of client preferences", async () => {
    await accounts.pool.query("UPDATE tournaments SET format='BT10:unlimited' WHERE id=$1", [tournamentId]);
    const series = await startSeries();
    const authorization = await authorize(series.id, alice);
    const room = new TournamentTestRoom();
    room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
    (room as unknown as { roomId: string }).roomId = "historical-room";
    await room.onCreate({ seed: 1, tournamentRoom: true, tournamentGameId: authorization.gameId, format: "pauper" });
    expect(room.state.format).toBe("BT10:unlimited");
    expect(room.state.unlimited).toBe(true);
    const options = { ...joinOptions(authorization.gameId, authorization.token), format: "pauper" as const };
    const client = fakeClient("historical-player");
    expect(await room.onAuth(client, options)).toBe(true);
    room.onJoin(client, options);
    expect(room.state.players[0]?.displayName).toBe("Registered Alice");
    room.onDispose();
  });

  it("ignores a forged banlist when seating a tournament participant", async () => {
    const series = await startSeries();
    const authorization = await authorize(series.id, alice);
    const room = makeRoom("frozen-banlist-room");
    const options = {
      ...joinOptions(authorization.gameId, authorization.token),
      banlistCards: [{ cardId: RED_DECK.mainDeck[0]!, status: "banned" as const, allowedCopies: 0 }],
    };
    const client = fakeClient("frozen-player");
    expect(await room.onAuth(client, options)).toBe(true);
    room.onJoin(client, options);
    expect(room.state.players[0]?.displayName).toBe("Registered Alice");
    room.onDispose();
  });

  it("admits both participants on their own authorizations and preserves their registered names", async () => {
    const series = await startSeries();
    const room = makeRoom("room-1");
    const first = await authorize(series.id, alice);
    const options = joinOptions(first.gameId, first.token);

    expect(await room.onAuth(fakeClient("session-0"), options)).toBe(true);
    // The authorization is the identity: a client cannot name itself.
    expect(options.displayName).toBe("Registered Alice");

    const second = await authorize(series.id, bob);
    const opponentOptions = joinOptions(second.gameId, second.token);
    expect(await room.onAuth(fakeClient("session-1"), opponentOptions)).toBe(true);
    expect(opponentOptions.displayName).toBe("Registered Bob");
    expect((await store.series(series.id))?.games[0]).toMatchObject({ roomId: "room-1", status: "room_claimed" });
  });

  it("refuses a token that has already entered a different room", async () => {
    const series = await startSeries();
    const credentials = await authorize(series.id, alice);
    expect(
      await makeRoom("room-1").onAuth(fakeClient("session-0"), joinOptions(credentials.gameId, credentials.token)),
    ).toBe(true);
    expect(
      await makeRoom("room-2").onAuth(fakeClient("session-0"), joinOptions(credentials.gameId, credentials.token)),
    ).toBe(false);
  });

  it("refuses a forged token, and refuses a valid token in a room already bound to another game", async () => {
    const series = await startSeries();
    const credentials = await authorize(series.id, alice);
    const room = makeRoom("room-1");
    expect(await room.onAuth(fakeClient("session-0"), joinOptions(credentials.gameId, "forged"))).toBe(false);

    expect(await room.onAuth(fakeClient("session-0"), joinOptions(credentials.gameId, credentials.token))).toBe(true);
    const bobCredentials = await authorize(series.id, bob);
    expect(await room.onAuth(fakeClient("session-1"), joinOptions(randomUUID(), bobCredentials.token))).toBe(false);
  });

  it("refuses the same account twice in one game", async () => {
    const series = await startSeries();
    const room = makeRoom("room-1");
    const first = await authorize(series.id, alice);
    const firstOptions = joinOptions(first.gameId, first.token);
    expect(await room.onAuth(fakeClient("session-0"), firstOptions)).toBe(true);
    room.clients.push(fakeClient("session-0"));
    room.onJoin(room.clients[0]!, firstOptions);

    // A fresh authorization for the same account, after the first was consumed by this room.
    const again = await authorize(series.id, alice);
    expect(await room.onAuth(fakeClient("session-2"), joinOptions(again.gameId, again.token))).toBe(false);
  });

  it("refuses a game authorization presented to a room that is not a tournament room", async () => {
    const series = await startSeries();
    const credentials = await authorize(series.id, alice);
    const casual = new TournamentTestRoom();
    casual.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
    (casual as unknown as { roomId: string }).roomId = "casual-1";
    casual.onCreate({ seed: 1, botRoom: false });
    expect(await casual.onAuth(fakeClient("session-0"), joinOptions(credentials.gameId, credentials.token))).toBe(
      false,
    );
  });

  it("seats the frozen competitive deck and discards whatever the client sent", async () => {
    const series = await startSeries();
    const room = makeRoom("room-1");
    const engine = (room as unknown as { engine: { seatPlayer: (...args: unknown[]) => void } }).engine;
    const seated = vi.spyOn(engine, "seatPlayer");
    await seatBoth(room, series.id);

    expect(seated).toHaveBeenCalledTimes(2);
    for (const call of seated.mock.calls) {
      const options = call[2] as AegisJoinOptions;
      expect(options.deck.mainDeck).toEqual(FROZEN_DECK.mainDeck);
      expect(options.deck.eggDeck).toEqual(FROZEN_DECK.eggDeck);
      expect(options.deck.mainDeck).not.toEqual(CLIENT_SUPPLIED_DECK.mainDeck);
      expect(options.deckName).toBe(FROZEN_DECK.name);
    }
  });

  it("refuses a participant whose deck was never frozen", async () => {
    await accounts.pool.query("UPDATE tournament_participants SET deck_snapshot=NULL WHERE account_id=$1", [alice]);
    const series = await startSeries();
    const credentials = await authorize(series.id, alice);
    expect(
      await makeRoom("room-1").onAuth(fakeClient("session-0"), joinOptions(credentials.gameId, credentials.token)),
    ).toBe(false);
  });
});

/**
 * Colyseus builds its room-discovery query only from the filter keys a client actually sends, so
 * `filterBy(["tournamentMatchId","tournamentGameId"])` alone is asymmetric: a legacy join carrying a
 * spurious `tournamentGameId` would create a room that a later program join for that game discovers
 * and enters, seating a non-participant in a real tournament game. The room refuses the mix from
 * both sides.
 */
describe("keeping the two tournament flows apart", () => {
  it("refuses a legacy join that also carries a program game id", async () => {
    const series = await startSeries();
    const credentials = await authorize(series.id, alice);
    const room = makeRoom("room-1");
    expect(
      await room.onAuth(fakeClient("session-0"), {
        displayName: "Impostor",
        deck: { ...CLIENT_SUPPLIED_DECK },
        authTicket: "whatever",
        tournamentMatchId: matchId,
        tournamentGameId: credentials.gameId,
      }),
    ).toBe(false);
    // The game is untouched, so the real participants can still open it.
    expect((await store.series(series.id))?.games[0]?.roomId ?? null).toBeNull();
    expect(await room.onAuth(fakeClient("session-1"), joinOptions(credentials.gameId, credentials.token))).toBe(true);
  });

  it("refuses a program join that also carries legacy credentials", async () => {
    const series = await startSeries();
    const credentials = await authorize(series.id, alice);
    const room = makeRoom("room-1");
    expect(
      await room.onAuth(fakeClient("session-0"), {
        ...joinOptions(credentials.gameId, credentials.token),
        authTicket: "whatever",
      }),
    ).toBe(false);
    expect(
      await room.onAuth(fakeClient("session-0"), {
        ...joinOptions(credentials.gameId, credentials.token),
        tournamentMatchId: matchId,
      }),
    ).toBe(false);
    expect((await store.series(series.id))?.games[0]?.roomId ?? null).toBeNull();
  });
});

/**
 * A rejected join must leave nothing claimed. Both exclusive claims — the legacy bracket's
 * `room_id` and a Tournament Game's binding — are permanent once taken, so taking one before the
 * cheap checks have passed would wedge a real confrontation on a room nobody ever entered.
 */
describe("rejections leave nothing claimed", () => {
  it("does not bind the game when the join is rejected for a later reason", async () => {
    const series = await startSeries();
    const room = makeRoom("room-1");
    const first = await authorize(series.id, alice);
    const firstOptions = joinOptions(first.gameId, first.token);
    expect(await room.onAuth(fakeClient("session-0"), firstOptions)).toBe(true);
    room.clients.push(fakeClient("session-0"));
    room.onJoin(room.clients[0]!, firstOptions);

    // Same account again: rejected by the duplicate-account check, AFTER the authorization is valid.
    const again = await authorize(series.id, alice);
    expect(await room.onAuth(fakeClient("session-9"), joinOptions(again.gameId, again.token))).toBe(false);

    // The rejected token was never consumed, so the account can still enter — and the real opponent
    // is still able to join the game.
    const second = await authorize(series.id, bob);
    expect(await room.onAuth(fakeClient("session-1"), joinOptions(second.gameId, second.token))).toBe(true);
    expect((await store.series(series.id))?.games[0]).toMatchObject({ roomId: "room-1", status: "room_claimed" });
  });

  it("does not claim the legacy bracket room when the join is rejected for a later reason", async () => {
    const legacyMatch = randomUUID();
    await accounts.pool.query(
      `INSERT INTO tournament_matches (id, tournament_id, round, position, player0_account_id, player1_account_id, status)
       VALUES ($1,$2,2,0,$3,$4,'pending')`,
      [legacyMatch, tournamentId, alice, bob],
    );
    const room = makeRoom("legacy-room");
    // A ranked flag on a tournament room is refused, but only after the ticket has been read.
    const ticket = await accounts.createRoomTicket(alice, legacyMatch);
    expect(
      await room.onAuth(fakeClient("session-0"), {
        displayName: "Alice",
        deck: { ...CLIENT_SUPPLIED_DECK },
        ranked: true,
        authTicket: ticket,
        tournamentMatchId: legacyMatch,
      }),
    ).toBe(false);

    // The bracket match is still free for the room that legitimately hosts it.
    expect(
      (
        await accounts.pool.query<{ room_id: string | null }>("SELECT room_id FROM tournament_matches WHERE id=$1", [
          legacyMatch,
        ])
      ).rows[0]?.room_id ?? null,
    ).toBeNull();
    expect(await accounts.claimTournamentRoom(legacyMatch, "legacy-room")).toBe(true);
  });
});

describe("reporting one game's result", () => {
  it("reports the outcome to the series and advances nothing itself", async () => {
    const series = await startSeries();
    const room = makeRoom("room-1");
    await seatBoth(room, series.id);
    await reportGameOver(room, won(0));

    const after = await store.series(series.id);
    expect(after?.wins).toEqual([1, 0]);
    expect(after?.status).toBe("playing");
    // The room touched no legacy bracket state.
    expect(
      (
        await accounts.pool.query<{ status: string; room_id: string | null }>(
          "SELECT status, room_id FROM tournament_matches WHERE id=$1",
          [matchId],
        )
      ).rows[0],
    ).toEqual({ status: "pending", room_id: null });
  });

  it("is idempotent when the same room reports the same outcome twice", async () => {
    const series = await startSeries();
    const room = makeRoom("room-1");
    await seatBoth(room, series.id);
    await reportGameOver(room, won(1));
    await reportGameOver(room, won(1));
    expect((await store.series(series.id))?.wins).toEqual([0, 1]);
  });

  it("reports a draw without scoring it", async () => {
    const series = await startSeries();
    const room = makeRoom("room-1");
    await seatBoth(room, series.id);
    await reportGameOver(room, { kind: "gameOver", result: { outcome: "draw" }, reason: "deckOut" });
    const after = await store.series(series.id);
    expect(after?.wins).toEqual([0, 0]);
    expect(after?.games[0]?.result).toBe("draw");
  });

  it("plays a whole 2-0 across two rooms on one unchanged clock", async () => {
    const series = await startSeries();
    const first = makeRoom("room-1");
    await seatBoth(first, series.id);
    await reportGameOver(first, won(0));
    first.onDispose();

    const second = makeRoom("room-2");
    await seatBoth(second, series.id);
    await reportGameOver(second, won(0));

    const after = await store.series(series.id);
    expect(after?.wins).toEqual([2, 0]);
    expect(after?.officialResult).toBe("participant0");
    expect(after?.games.map((game) => game.roomId)).toEqual(["room-1", "room-2"]);
    // A new room for game 2 is still the same confrontation, so the deadline never moved.
    expect(after?.seriesDeadlineAt).toBe(series.seriesDeadlineAt);
  });

  it("leaves the series untouched when a player drops and reconnects mid-game", async () => {
    const series = await startSeries();
    const room = makeRoom("room-1");
    await seatBoth(room, series.id);
    const before = await store.series(series.id);

    const dropped = room.clients[0]!;
    room.allowReconnection = vi.fn<() => Promise<Client>>(
      async () => dropped,
    ) as unknown as AegisRoom["allowReconnection"];
    room.lock = vi.fn<() => Promise<void>>(async () => undefined) as AegisRoom["lock"];
    room.unlock = vi.fn<() => Promise<void>>(async () => undefined) as AegisRoom["unlock"];
    await room.onLeave(dropped, CloseCode.ABNORMAL_CLOSURE);

    expect(await store.series(series.id)).toEqual(before);
    // The reconnected seat then finishes the game normally.
    await reportGameOver(room, won(0));
    expect((await store.series(series.id))?.wins).toEqual([1, 0]);
  });

  /**
   * A refused result means a finished game was never persisted and the confrontation is now waiting
   * on something that will never arrive. The plan calls for an alert on exactly this, so it must at
   * minimum reach the log with the ids needed to find it.
   */
  it("logs loudly when the series refuses the result instead of swallowing it", async () => {
    const series = await startSeries();
    const room = makeRoom("room-1");
    const { gameId } = await seatBoth(room, series.id);
    // The game finishes in its own room, then this room reports a second, contradictory-looking
    // result for it — the series refuses on room_mismatch.
    await store.recordGameResult({
      gameId,
      roomId: "room-1",
      outcome: { kind: "winner", winnerAccountId: alice },
      finishedAt: START + 100,
    });
    await accounts.pool.query("UPDATE tournament_games SET room_id='room-elsewhere' WHERE id=$1", [gameId]);

    const logged = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await reportGameOver(room, won(0));
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("REJECTED"));
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(gameId));
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("room_mismatch"));
    expect(JSON.parse(String(logged.mock.calls[0]![0])).matchId).toBe(room.state.matchLogId);
    logged.mockRestore();
  });

  it("marks the game as playing once the match starts", async () => {
    const series = await startSeries();
    const room = makeRoom("room-1");
    await seatBoth(room, series.id);
    expect((await store.series(series.id))?.games[0]?.status).toBe("room_claimed");

    (room as unknown as { startMatchNow: () => void }).startMatchNow();
    await vi.waitFor(async () => {
      expect((await store.series(series.id))?.games[0]?.status).toBe("playing");
    });
  });

  it("does not release the game's room on dispose the way the legacy bracket does", async () => {
    const series = await startSeries();
    const room = makeRoom("room-1");
    await seatBoth(room, series.id);
    room.onDispose();
    expect((await store.series(series.id))?.games[0]?.roomId).toBe("room-1");
  });
});

describe("spectating a Tournament Game room", () => {
  async function liveRoom(): Promise<TournamentTestRoom> {
    const series = await startSeries();
    const room = makeRoom("spectated-room");
    await seatBoth(room, series.id);
    (room as unknown as { startMatchNow: () => void }).startMatchNow();
    return room;
  }

  async function spectatorOptions(name: string): Promise<AegisJoinOptions> {
    const account = await accounts.accountForIdentity("discord", name, name);
    return {
      spectator: true,
      displayName: "",
      deck: { mainDeck: [], eggDeck: [] },
      authTicket: await accounts.createRoomTicket(account.id),
    };
  }

  async function setPolicy(policy: string): Promise<void> {
    await accounts.pool.query("UPDATE tournaments SET spectator_policy=$2 WHERE id=$1", [tournamentId, policy]);
  }

  it("admits an allowlisted account with a public view", async () => {
    await setPolicy("allowlist");
    const caster = await accounts.accountForIdentity("discord", "caster", "Caster");
    await accounts.pool.query(
      "INSERT INTO tournament_spectators (tournament_id, account_id, added_at) VALUES ($1,$2,1)",
      [tournamentId, caster.id],
    );
    const room = await liveRoom();
    const client = fakeClient("caster-session");
    const options = await spectatorOptions("caster");
    expect(await room.onAuth(client, options)).toBe(true);
    room.clients.push(client);
    room.onJoin(client, options);
    expect(JSON.parse(room.state.players[0]!.spectatorNamesJson)).toEqual(["Caster"]);
    room.onDispose();
  });

  it("refuses an account missing from the allowlist", async () => {
    await setPolicy("allowlist");
    const room = await liveRoom();
    expect(await room.onAuth(fakeClient("outsider"), await spectatorOptions("outsider"))).toBe(false);
    room.onDispose();
  });

  it("refuses everyone but staff when spectating is off", async () => {
    const room = await liveRoom();
    expect(await room.onAuth(fakeClient("outsider"), await spectatorOptions("outsider"))).toBe(false);
    const admin = await accounts.accountForIdentity("discord", "admin", "Admin");
    await accounts.pool.query("UPDATE accounts SET roles=ARRAY['admin'] WHERE id=$1", [admin.id]);
    expect(await room.onAuth(fakeClient("admin"), await spectatorOptions("admin"))).toBe(true);
    room.onDispose();
  });

  it("refuses a player still in the event even when any signed-in account may watch", async () => {
    await setPolicy("signed_in");
    const room = await liveRoom();
    expect(await room.onAuth(fakeClient("outsider"), await spectatorOptions("outsider"))).toBe(true);
    const ticket = await accounts.createRoomTicket(bob);
    expect(
      await room.onAuth(fakeClient("bob-watching"), {
        spectator: true,
        displayName: "",
        deck: { mainDeck: [], eggDeck: [] },
        authTicket: ticket,
      }),
    ).toBe(false);
    room.onDispose();
  });

  it("refuses a spectator without a room ticket", async () => {
    await setPolicy("signed_in");
    const room = await liveRoom();
    expect(
      await room.onAuth(fakeClient("anonymous"), {
        spectator: true,
        displayName: "",
        deck: { mainDeck: [], eggDeck: [] },
      }),
    ).toBe(false);
    room.onDispose();
  });

  it("refuses spectators before the match starts", async () => {
    await setPolicy("signed_in");
    const series = await startSeries();
    const room = makeRoom("waiting-room");
    await seatBoth(room, series.id);
    expect(await room.onAuth(fakeClient("early"), await spectatorOptions("early"))).toBe(false);
    room.onDispose();
  });
});
