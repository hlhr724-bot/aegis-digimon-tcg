import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "../../accounts/AccountStore.js";
import type { Pool } from "pg";
import { snapshotFixtures } from "../../db/snapshotFixture.js";
import type { AuthoritativeGameResult } from "../TournamentManager.js";
import { inProcessTournamentLock } from "../participants/index.js";
import { ConflictingGameResultError, SeriesStore, type SeriesRecord } from "./SeriesStore.js";

const SERIES_DURATION_MS = 2_700_000;
const START = 1_000_000;

type Fixture = {
  store: SeriesStore;
  accounts: AccountStore;
  tournamentId: string;
  matchId: string;
  alice: string;
  bob: string;
  carol: string;
};

let fixture: Fixture;

/** One arrangement, built once and restored before each test. */
const fixtureFor = snapshotFixtures<Fixture>();

async function build(): Promise<Fixture> {
  return fixtureFor("default", buildOn);
}

async function buildOn(pool: Pool): Promise<Fixture> {
  const accounts = new AccountStore(pool);
  const store = new SeriesStore(accounts, inProcessTournamentLock());
  const alice = (await accounts.accountForIdentity("discord", "alice", "Alice")).id;
  const bob = (await accounts.accountForIdentity("discord", "bob", "Bob")).id;
  const carol = (await accounts.accountForIdentity("discord", "carol", "Carol")).id;
  const tournament = await accounts.createTournament(alice, {
    name: "Series Cup",
    block: "BT10",
    startsAt: START,
    maxPlayers: 8,
  });
  const matchId = randomUUID();
  await accounts.pool.query(
    `INSERT INTO tournament_matches (id, tournament_id, round, position, player0_account_id, player1_account_id, status)
     VALUES ($1,$2,1,0,$3,$4,'pending')`,
    [matchId, tournament.id, alice, bob],
  );
  for (const accountId of [alice, bob]) await freezeParticipant(accounts, tournament.id, accountId);
  return { store, accounts, tournamentId: tournament.id, matchId, alice, bob, carol };
}

/** An active participant with the competitive deck they froze when check-in closed. */
async function freezeParticipant(accounts: AccountStore, tournamentId: string, accountId: string): Promise<void> {
  const accountName = (
    await accounts.pool.query<{ display_name: string }>("SELECT display_name FROM accounts WHERE id=$1", [accountId])
  ).rows[0]!.display_name;
  const displayName = `Registered ${accountName}`;
  await accounts.pool.query(
    `INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, status, deck_snapshot, created_at)
     VALUES ($1,$2,'human',$3,$4,'active',$5,1)`,
    [
      randomUUID(),
      tournamentId,
      accountId,
      displayName,
      JSON.stringify({
        deckId: "frozen",
        name: "Frozen Deck",
        mainDeck: ["BT1-001"],
        eggDeck: ["BT1-002"],
        revision: 1,
      }),
    ],
  );
}

/** Both players arrive, which is what starts the series and its shared clock. */
async function startSeries(winsRequired = 2, durationMs: number | null = SERIES_DURATION_MS): Promise<SeriesRecord> {
  await fixture.store.markPresent({
    tournamentId: fixture.tournamentId,
    matchId: fixture.matchId,
    accountId: fixture.alice,
    winsRequired,
    seriesDurationMs: durationMs,
    now: START,
  });
  const both = await fixture.store.markPresent({
    tournamentId: fixture.tournamentId,
    matchId: fixture.matchId,
    accountId: fixture.bob,
    winsRequired,
    seriesDurationMs: durationMs,
    now: START + 5_000,
  });
  if (!both.ok || !both.value.series) throw new Error("series did not start");
  return both.value.series;
}

/** Authorizes the next game for both players and binds it to a fresh room. */
async function openGame(seriesId: string, roomId: string, now: number): Promise<string> {
  const forAlice = await fixture.store.authorizeNextGame({ seriesId, accountId: fixture.alice, now });
  const forBob = await fixture.store.authorizeNextGame({ seriesId, accountId: fixture.bob, now });
  if (!forAlice.ok || !forBob.ok) throw new Error("authorization failed");
  for (const authorization of [forAlice.value, forBob.value]) {
    const claimed = await fixture.store.claimGame({
      gameId: authorization.gameId,
      authorizationToken: authorization.token,
      roomId,
      now,
    });
    if (!claimed.ok) throw new Error(`claim failed: ${claimed.reason}`);
  }
  return forAlice.value.gameId;
}

function winner(gameId: string, roomId: string, accountId: string, finishedAt: number): AuthoritativeGameResult {
  return { gameId, roomId, outcome: { kind: "winner", winnerAccountId: accountId }, finishedAt };
}

function drawn(gameId: string, roomId: string, finishedAt: number): AuthoritativeGameResult {
  return { gameId, roomId, outcome: { kind: "draw" }, finishedAt };
}

beforeEach(async () => {
  fixture = await build();
});

describe("presence and the shared clock", () => {
  it("starts the series only when both players are present", async () => {
    const first = await fixture.store.markPresent({
      tournamentId: fixture.tournamentId,
      matchId: fixture.matchId,
      accountId: fixture.alice,
      winsRequired: 2,
      seriesDurationMs: SERIES_DURATION_MS,
      now: START,
    });
    expect(first.ok && first.value.series).toBeUndefined();
    expect(first.ok && first.value.presentAt).toEqual([START, null]);

    const series = await startSeries();
    expect(series.status).toBe("playing");
    expect(series.wins).toEqual([0, 0]);
    expect(series.seriesDeadlineAt).toBe(START + 5_000 + SERIES_DURATION_MS);
  });

  it("keeps the first arrival time and the first deadline when presence is re-marked", async () => {
    const series = await startSeries();
    const again = await fixture.store.markPresent({
      tournamentId: fixture.tournamentId,
      matchId: fixture.matchId,
      accountId: fixture.alice,
      winsRequired: 2,
      seriesDurationMs: SERIES_DURATION_MS,
      now: START + 900_000,
    });
    expect(again.ok && again.value.presentAt).toEqual([START, START + 5_000]);
    expect(again.ok && again.value.series?.seriesDeadlineAt).toBe(series.seriesDeadlineAt);
  });

  it("refuses a stranger and an unknown match", async () => {
    const stranger = await fixture.store.markPresent({
      tournamentId: fixture.tournamentId,
      matchId: fixture.matchId,
      accountId: fixture.carol,
      winsRequired: 2,
      seriesDurationMs: SERIES_DURATION_MS,
    });
    expect(stranger).toEqual({ ok: false, reason: "not_a_participant" });
    const missing = await fixture.store.markPresent({
      tournamentId: fixture.tournamentId,
      matchId: randomUUID(),
      accountId: fixture.alice,
      winsRequired: 2,
      seriesDurationMs: SERIES_DURATION_MS,
    });
    expect(missing).toEqual({ ok: false, reason: "match_not_found" });
  });

  /**
   * The attack this closes: the caller reads `winsRequired` and the duration out of the tournament
   * named in the URL, so anybody seated in a real match could create their own event with a
   * best-of-one, untimed preset and, by arriving second through it, start the REAL series under
   * those rules. The match must belong to the tournament whose ruleset is being applied.
   */
  it("refuses a match that belongs to a different tournament, even a real one the caller owns", async () => {
    const attackerEvent = await fixture.accounts.createTournament(fixture.alice, {
      name: "Attacker Cup",
      block: "BT10",
      startsAt: START,
      maxPlayers: 8,
    });
    const smuggled = await fixture.store.markPresent({
      tournamentId: attackerEvent.id,
      matchId: fixture.matchId,
      accountId: fixture.alice,
      winsRequired: 1,
      seriesDurationMs: null,
      now: START,
    });
    expect(smuggled).toEqual({ ok: false, reason: "match_not_found" });
    // Nothing was written: no presence, and therefore no series to start under the wrong rules.
    expect((await fixture.store.presence(fixture.matchId))?.presentAt).toEqual([null, null]);

    // The genuine call still starts it under the real event's rules.
    const series = await startSeries();
    expect(series.winsRequired).toBe(2);
    expect(series.seriesDeadlineAt).not.toBeNull();
  });

  it("runs untimed when the ruleset has no duration for the phase", async () => {
    const series = await startSeries(2, null);
    expect(series.seriesDeadlineAt).toBeNull();
    expect(
      await fixture.store.resolveSeriesByDeadline({ seriesId: series.id, policy: { kind: "swiss", onTie: "draw" } }),
    ).toEqual({ ok: false, reason: "no_deadline" });
  });
});

describe("playing a series", () => {
  it("resolves a 2-0 after two games", async () => {
    const series = await startSeries();
    const game1 = await openGame(series.id, "room-1", START + 10_000);
    await fixture.store.recordGameResult(winner(game1, "room-1", fixture.alice, START + 600_000));
    const game2 = await openGame(series.id, "room-2", START + 610_000);
    const final = await fixture.store.recordGameResult(winner(game2, "room-2", fixture.alice, START + 1_200_000));

    expect(final.ok && final.value.wins).toEqual([2, 0]);
    expect(final.ok && final.value.status).toBe("resolved");
    expect(final.ok && final.value.officialResult).toBe("participant0");
    expect(final.ok && final.value.games.map((game) => game.gameIndex)).toEqual([1, 2]);
  });

  it("resolves a 2-1 after three games and keeps the original deadline throughout", async () => {
    const series = await startSeries();
    const deadline = series.seriesDeadlineAt;
    const game1 = await openGame(series.id, "room-1", START + 10_000);
    await fixture.store.recordGameResult(winner(game1, "room-1", fixture.alice, START + 500_000));
    const game2 = await openGame(series.id, "room-2", START + 510_000);
    await fixture.store.recordGameResult(winner(game2, "room-2", fixture.bob, START + 1_000_000));
    const game3 = await openGame(series.id, "room-3", START + 1_010_000);
    const final = await fixture.store.recordGameResult(winner(game3, "room-3", fixture.bob, START + 1_500_000));

    expect(final.ok && final.value.wins).toEqual([1, 2]);
    expect(final.ok && final.value.officialResult).toBe("participant1");
    // The clock never resets: three rooms, one deadline, set when the players arrived.
    expect(final.ok && final.value.seriesDeadlineAt).toBe(deadline);
  });

  it("replays a drawn game in the same series without counting a win or moving the clock", async () => {
    const series = await startSeries();
    const game1 = await openGame(series.id, "room-1", START + 10_000);
    const afterDraw = await fixture.store.recordGameResult(drawn(game1, "room-1", START + 500_000));
    expect(afterDraw.ok && afterDraw.value.wins).toEqual([0, 0]);
    expect(afterDraw.ok && afterDraw.value.status).toBe("playing");

    const game2 = await openGame(series.id, "room-2", START + 510_000);
    expect(game2).not.toBe(game1);
    const replayed = await fixture.store.series(series.id);
    expect(replayed?.games.map((game) => game.gameIndex)).toEqual([1, 2]);
    expect(replayed?.seriesDeadlineAt).toBe(series.seriesDeadlineAt);
  });

  it("gives game 2 a new room and the same deadline", async () => {
    const series = await startSeries();
    const game1 = await openGame(series.id, "room-1", START + 10_000);
    await fixture.store.recordGameResult(winner(game1, "room-1", fixture.alice, START + 500_000));
    const game2 = await openGame(series.id, "room-2", START + 510_000);

    const state = await fixture.store.series(series.id);
    expect(state?.games.map((game) => game.roomId)).toEqual(["room-1", "room-2"]);
    expect(state?.games.find((game) => game.id === game2)?.status).toBe("room_claimed");
    expect(state?.seriesDeadlineAt).toBe(series.seriesDeadlineAt);
  });

  /**
   * The regression that made an untimed series unresolvable: at 1-1 with the third game drawn there
   * is no clock to fall back on, so if a draw spent the game budget the confrontation would sit in
   * `playing` for ever with nothing left to authorize. A draw decides nothing, so it costs nothing.
   */
  it("keeps offering games in an untimed series until one of them is actually decided", async () => {
    const series = await startSeries(2, null);
    const game1 = await openGame(series.id, "room-1", START + 10_000);
    await fixture.store.recordGameResult(winner(game1, "room-1", fixture.alice, START + 400_000));
    const game2 = await openGame(series.id, "room-2", START + 410_000);
    await fixture.store.recordGameResult(winner(game2, "room-2", fixture.bob, START + 800_000));
    const game3 = await openGame(series.id, "room-3", START + 810_000);
    await fixture.store.recordGameResult(drawn(game3, "room-3", START + 1_200_000));

    const fourth = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: START + 1_300_000,
    });
    expect(fourth.ok && fourth.value.gameIndex).toBe(4);
    const state = await fixture.store.series(series.id);
    expect(state?.wins).toEqual([1, 1]);
    expect(state?.status).toBe("playing");
  });

  it("stops offering games the moment the best-of is decided, so the budget can never strand it", async () => {
    const series = await startSeries();
    const game1 = await openGame(series.id, "room-1", START + 10_000);
    await fixture.store.recordGameResult(winner(game1, "room-1", fixture.alice, START + 400_000));
    const game2 = await openGame(series.id, "room-2", START + 410_000);
    await fixture.store.recordGameResult(winner(game2, "room-2", fixture.bob, START + 800_000));
    const game3 = await openGame(series.id, "room-3", START + 810_000);
    await fixture.store.recordGameResult(winner(game3, "room-3", fixture.alice, START + 1_200_000));

    const state = await fixture.store.series(series.id);
    expect(state?.status).toBe("resolved");
    expect(state?.officialResult).toBe("participant0");
    expect(
      await fixture.store.authorizeNextGame({
        seriesId: series.id,
        accountId: fixture.alice,
        now: START + 1_300_000,
      }),
    ).toEqual({ ok: false, reason: "series_already_resolved" });
  });

  it("refuses to authorize anything once the series is resolved", async () => {
    const series = await startSeries();
    const game1 = await openGame(series.id, "room-1", START + 10_000);
    await fixture.store.recordGameResult(winner(game1, "room-1", fixture.alice, START + 400_000));
    const game2 = await openGame(series.id, "room-2", START + 410_000);
    await fixture.store.recordGameResult(winner(game2, "room-2", fixture.alice, START + 800_000));

    expect(
      await fixture.store.authorizeNextGame({ seriesId: series.id, accountId: fixture.bob, now: START + 810_000 }),
    ).toEqual({ ok: false, reason: "series_already_resolved" });
  });
});

describe("authorization and room claims", () => {
  it("issues one live authorization per participant and refuses a second until it expires", async () => {
    const series = await startSeries();
    const first = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: START + 10_000,
      ttlMs: 60_000,
    });
    expect(first.ok).toBe(true);
    expect(
      await fixture.store.authorizeNextGame({
        seriesId: series.id,
        accountId: fixture.alice,
        now: START + 20_000,
        ttlMs: 60_000,
      }),
    ).toEqual({ ok: false, reason: "authorization_live" });

    const reissued = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: START + 80_000,
      ttlMs: 60_000,
    });
    expect(reissued.ok).toBe(true);
    // Both authorizations name the same game: the series never has two games open at once.
    expect(reissued.ok && first.ok && reissued.value.gameId).toBe(first.ok ? first.value.gameId : "");
  });

  it("refuses an expired token at claim time", async () => {
    const series = await startSeries();
    const authorization = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: START + 10_000,
      ttlMs: 60_000,
    });
    if (!authorization.ok) throw new Error("authorization failed");
    expect(
      await fixture.store.claimGame({
        gameId: authorization.value.gameId,
        authorizationToken: authorization.value.token,
        roomId: "room-late",
        now: START + 200_000,
      }),
    ).toEqual({ ok: false, reason: "authorization_expired" });
  });

  it("binds one room and rejects a second room claiming the same game", async () => {
    const series = await startSeries();
    const first = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: START + 10_000,
    });
    const second = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.bob,
      now: START + 10_000,
    });
    if (!first.ok || !second.ok) throw new Error("authorization failed");

    expect(
      (
        await fixture.store.claimGame({
          gameId: first.value.gameId,
          authorizationToken: first.value.token,
          roomId: "room-1",
          now: START + 11_000,
        })
      ).ok,
    ).toBe(true);
    // The opponent's own token joins the room the first claim bound.
    expect(
      (
        await fixture.store.claimGame({
          gameId: second.value.gameId,
          authorizationToken: second.value.token,
          roomId: "room-1",
          now: START + 12_000,
        })
      ).ok,
    ).toBe(true);
    // Any other room is a duplicate claim on a game that is already being played.
    expect(
      await fixture.store.claimGame({
        gameId: first.value.gameId,
        authorizationToken: first.value.token,
        roomId: "room-other",
        now: START + 13_000,
      }),
    ).toEqual({ ok: false, reason: "authorization_consumed" });
  });

  it("re-admits a consumed token to the room it already entered", async () => {
    const series = await startSeries();
    const authorization = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: START + 10_000,
    });
    if (!authorization.ok) throw new Error("authorization failed");
    await fixture.store.claimGame({
      gameId: authorization.value.gameId,
      authorizationToken: authorization.value.token,
      roomId: "room-1",
      now: START + 11_000,
    });
    const reconnect = await fixture.store.claimGame({
      gameId: authorization.value.gameId,
      authorizationToken: authorization.value.token,
      roomId: "room-1",
      now: START + 900_000,
    });
    expect(reconnect.ok && reconnect.value.accountId).toBe(fixture.alice);
  });

  it("rejects an unknown token and a token from another game", async () => {
    const series = await startSeries();
    const authorization = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: START + 10_000,
    });
    if (!authorization.ok) throw new Error("authorization failed");
    expect(
      await fixture.store.claimGame({
        gameId: authorization.value.gameId,
        authorizationToken: "not-a-token",
        roomId: "room-1",
      }),
    ).toEqual({ ok: false, reason: "authorization_invalid" });
    expect(
      await fixture.store.claimGame({
        gameId: randomUUID(),
        authorizationToken: authorization.value.token,
        roomId: "room-1",
      }),
    ).toEqual({ ok: false, reason: "game_not_found" });
  });

  it("reports the frozen competitive deck, and inspecting binds nothing", async () => {
    const series = await startSeries();
    const authorization = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: START + 10_000,
    });
    if (!authorization.ok) throw new Error("authorization failed");
    const inspected = await fixture.store.inspectAuthorization({
      gameId: authorization.value.gameId,
      authorizationToken: authorization.value.token,
      roomId: "room-1",
      now: START + 11_000,
    });
    expect(inspected.ok && inspected.value.deck.mainDeck).toEqual(["BT1-001"]);
    expect(inspected.ok && inspected.value.displayName).toBe("Registered Alice");
    // An inspection is read-only: no room bound, and the token is still usable.
    const state = await fixture.store.series(series.id);
    expect(state?.games[0]).toMatchObject({ roomId: null, status: "allocated" });
    expect(
      (
        await fixture.store.claimGame({
          gameId: authorization.value.gameId,
          authorizationToken: authorization.value.token,
          roomId: "room-1",
          now: START + 12_000,
        })
      ).ok,
    ).toBe(true);
  });

  it("records the deck each seat played on the game, so a later participant edit cannot rewrite it", async () => {
    const series = await startSeries();
    const gameId = await openGame(series.id, "room-1", START + 10_000);
    await fixture.store.recordGameResult(winner(gameId, "room-1", fixture.alice, START + 20_000));

    // The participant re-freezes a different list. The played game must not follow it.
    await fixture.accounts.pool.query("UPDATE tournament_participants SET deck_snapshot=$1 WHERE account_id=$2", [
      JSON.stringify({ deckId: "swapped", name: "Swapped", mainDeck: ["BT9-999"], eggDeck: [], revision: 2 }),
      fixture.alice,
    ]);

    const played = (await fixture.store.series(series.id))?.games[0];
    expect(played?.deckSnapshots[0]?.mainDeck).toEqual(["BT1-001"]);
    expect(played?.deckSnapshots[0]?.deckId).toBe("frozen");
    expect(played?.deckSnapshots[1]?.mainDeck).toEqual(["BT1-001"]);
    // And the participant row genuinely did move, so the assertion above is about the game's own copy.
    const current = await fixture.accounts.pool.query<{ deck_snapshot: unknown }>(
      "SELECT deck_snapshot FROM tournament_participants WHERE account_id=$1",
      [fixture.alice],
    );
    const snapshot = current.rows[0]?.deck_snapshot;
    expect((typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot).deckId).toBe("swapped");
  });

  it("refuses an account with no frozen deck rather than seating them on a client-supplied one", async () => {
    await fixture.accounts.pool.query("UPDATE tournament_participants SET deck_snapshot=NULL WHERE account_id=$1", [
      fixture.alice,
    ]);
    const series = await startSeries();
    const authorization = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: START + 10_000,
    });
    if (!authorization.ok) throw new Error("authorization failed");
    expect(
      await fixture.store.inspectAuthorization({
        gameId: authorization.value.gameId,
        authorizationToken: authorization.value.token,
        roomId: "room-1",
        now: START + 11_000,
      }),
    ).toEqual({ ok: false, reason: "deck_not_frozen" });
  });

  it("moves a claimed game to playing when the room starts it, and only then", async () => {
    const series = await startSeries();
    const authorization = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: START + 10_000,
    });
    if (!authorization.ok) throw new Error("authorization failed");
    // Nothing to start before a room has claimed it.
    expect(await fixture.store.markGamePlaying(authorization.value.gameId, "room-1")).toBe(false);
    await fixture.store.claimGame({
      gameId: authorization.value.gameId,
      authorizationToken: authorization.value.token,
      roomId: "room-1",
      now: START + 11_000,
    });
    expect(await fixture.store.markGamePlaying(authorization.value.gameId, "room-1")).toBe(true);
    expect((await fixture.store.series(series.id))?.games[0]?.status).toBe("playing");
    // Idempotent, and a room that does not own the game cannot start it.
    expect(await fixture.store.markGamePlaying(authorization.value.gameId, "room-1")).toBe(false);
    expect(await fixture.store.markGamePlaying(authorization.value.gameId, "room-impostor")).toBe(false);
  });

  it("refuses to authorize a participant who is not in the match", async () => {
    const series = await startSeries();
    expect(
      await fixture.store.authorizeNextGame({ seriesId: series.id, accountId: fixture.carol, now: START + 10_000 }),
    ).toEqual({ ok: false, reason: "not_a_participant" });
  });
});

describe("recording results", () => {
  it("is a no-op when the same room reports the same outcome twice", async () => {
    const series = await startSeries();
    const game = await openGame(series.id, "room-1", START + 10_000);
    const first = await fixture.store.recordGameResult(winner(game, "room-1", fixture.alice, START + 500_000));
    const repeat = await fixture.store.recordGameResult(winner(game, "room-1", fixture.alice, START + 500_000));
    expect(first.ok && first.value.wins).toEqual([1, 0]);
    expect(repeat.ok && repeat.value.wins).toEqual([1, 0]);
  });

  it("throws loudly when a finished game is reported with a different outcome", async () => {
    const series = await startSeries();
    const game = await openGame(series.id, "room-1", START + 10_000);
    await fixture.store.recordGameResult(winner(game, "room-1", fixture.alice, START + 500_000));
    await expect(fixture.store.recordGameResult(winner(game, "room-1", fixture.bob, START + 600_000))).rejects.toThrow(
      ConflictingGameResultError,
    );
  });

  it("refuses a result from a room the game was never bound to", async () => {
    const series = await startSeries();
    const game = await openGame(series.id, "room-1", START + 10_000);
    expect(await fixture.store.recordGameResult(winner(game, "room-impostor", fixture.alice, START + 500_000))).toEqual(
      {
        ok: false,
        reason: "room_mismatch",
      },
    );
  });

  it("refuses a winner who is not one of the two participants", async () => {
    const series = await startSeries();
    const game = await openGame(series.id, "room-1", START + 10_000);
    expect(await fixture.store.recordGameResult(winner(game, "room-1", fixture.carol, START + 500_000))).toEqual({
      ok: false,
      reason: "not_a_participant",
    });
  });

  it("voids a game without scoring it and opens the next slot", async () => {
    const series = await startSeries();
    const game = await openGame(series.id, "room-1", START + 10_000);
    const voided = await fixture.store.recordGameResult({
      gameId: game,
      roomId: "room-1",
      outcome: { kind: "voided", reason: "room_lost" },
      finishedAt: START + 500_000,
    });
    expect(voided.ok && voided.value.wins).toEqual([0, 0]);
    expect(voided.ok && voided.value.games[0]?.status).toBe("voided");
    const next = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: START + 510_000,
    });
    expect(next.ok && next.value.gameIndex).toBe(2);
  });
});

describe("deadline resolution", () => {
  it("gives the confrontation to whoever is ahead on game wins", async () => {
    const series = await startSeries();
    const game = await openGame(series.id, "room-1", START + 10_000);
    await fixture.store.recordGameResult(winner(game, "room-1", fixture.bob, START + 500_000));
    const resolved = await fixture.store.resolveSeriesByDeadline({
      seriesId: series.id,
      policy: { kind: "swiss", onTie: "draw" },
      now: series.seriesDeadlineAt!,
    });
    expect(resolved.ok && resolved.value.officialResult).toBe("participant1");
    expect(resolved.ok && resolved.value.resolutionReason).toBe("deadline_ahead_on_games");
  });

  it("applies the swiss draw policy to a tie", async () => {
    const series = await startSeries();
    const resolved = await fixture.store.resolveSeriesByDeadline({
      seriesId: series.id,
      policy: { kind: "swiss", onTie: "draw" },
      now: series.seriesDeadlineAt!,
    });
    expect(resolved.ok && resolved.value.officialResult).toBe("draw");
    expect(resolved.ok && resolved.value.status).toBe("resolved");
  });

  it("applies the swiss double-loss policy to a tie", async () => {
    const series = await startSeries();
    const resolved = await fixture.store.resolveSeriesByDeadline({
      seriesId: series.id,
      policy: { kind: "swiss", onTie: "double_loss" },
      now: series.seriesDeadlineAt!,
    });
    expect(resolved.ok && resolved.value.officialResult).toBe("double_loss");
  });

  it("parks an elimination tie for an organizer instead of inventing a winner", async () => {
    const series = await startSeries();
    const resolved = await fixture.store.resolveSeriesByDeadline({
      seriesId: series.id,
      policy: { kind: "elimination" },
      now: series.seriesDeadlineAt!,
    });
    expect(resolved.ok && resolved.value.status).toBe("needs_organizer_decision");
    expect(resolved.ok && resolved.value.officialResult).toBeNull();
    expect(resolved.ok && resolved.value.resolutionReason).toBe("elimination_tie_needs_state_tiebreak");
  });

  it("refuses to resolve before the clock is spent", async () => {
    const series = await startSeries();
    expect(
      await fixture.store.resolveSeriesByDeadline({
        seriesId: series.id,
        policy: { kind: "swiss", onTie: "draw" },
        now: series.seriesDeadlineAt! - 1,
      }),
    ).toEqual({ ok: false, reason: "deadline_not_reached" });
  });

  it("voids the game still in progress and is idempotent on a second call", async () => {
    const series = await startSeries();
    const game = await openGame(series.id, "room-1", START + 10_000);
    const first = await fixture.store.resolveSeriesByDeadline({
      seriesId: series.id,
      policy: { kind: "swiss", onTie: "draw" },
      now: series.seriesDeadlineAt!,
    });
    expect(first.ok && first.value.games.find((entry) => entry.id === game)?.status).toBe("voided");
    const second = await fixture.store.resolveSeriesByDeadline({
      seriesId: series.id,
      policy: { kind: "swiss", onTie: "double_loss" },
      now: series.seriesDeadlineAt! + 60_000,
    });
    // The second call cannot re-decide the confrontation under a different policy.
    expect(second.ok && second.value.officialResult).toBe("draw");
    expect(second.ok && second.value.version).toBe(first.ok ? first.value.version : -1);
  });
});

describe("concurrency", () => {
  /**
   * Both players hitting "next game" at the same instant is the ordinary case, and it must produce
   * one game bound to one room rather than two.
   *
   * This proves the in-process half of the guarantee: the store serializes one series' mutations
   * through {@link inProcessTournamentLock}, and the transactions take `FOR UPDATE` on the series,
   * match and game rows for the cross-process half. pg-mem implements no row locks at all, so no
   * test here can prove anything about two API containers against one Postgres — that contract
   * belongs to the database. What is proven is that the code holds one lock across the whole
   * read-decide-write sequence, which is what makes the row locks reachable in production.
   */
  it("allocates exactly one game when both players authorize simultaneously", async () => {
    const series = await startSeries();
    const [forAlice, forBob] = await Promise.all([
      fixture.store.authorizeNextGame({ seriesId: series.id, accountId: fixture.alice, now: START + 10_000 }),
      fixture.store.authorizeNextGame({ seriesId: series.id, accountId: fixture.bob, now: START + 10_000 }),
    ]);
    expect(forAlice.ok && forBob.ok).toBe(true);
    expect(forAlice.ok && forBob.ok && forAlice.value.gameId).toBe(forBob.ok ? forBob.value.gameId : "");
    expect((await fixture.store.series(series.id))?.games).toHaveLength(1);
  });

  it("lets only one of two simultaneous rooms claim the game", async () => {
    const series = await startSeries();
    const authorization = await fixture.store.authorizeNextGame({
      seriesId: series.id,
      accountId: fixture.alice,
      now: START + 10_000,
    });
    if (!authorization.ok) throw new Error("authorization failed");
    const claims = await Promise.all(
      ["room-a", "room-b"].map((roomId) =>
        fixture.store.claimGame({
          gameId: authorization.value.gameId,
          authorizationToken: authorization.value.token,
          roomId,
          now: START + 11_000,
        }),
      ),
    );
    expect(claims.filter((claim) => claim.ok)).toHaveLength(1);
    expect((await fixture.store.series(series.id))?.games[0]?.roomId).toMatch(/^room-[ab]$/);
  });

  it("records only one win when the same result arrives twice at once", async () => {
    const series = await startSeries();
    const game = await openGame(series.id, "room-1", START + 10_000);
    await Promise.all([
      fixture.store.recordGameResult(winner(game, "room-1", fixture.alice, START + 500_000)),
      fixture.store.recordGameResult(winner(game, "room-1", fixture.alice, START + 500_000)),
    ]);
    expect((await fixture.store.series(series.id))?.wins).toEqual([1, 0]);
  });
});

it("publishes roster identities and the winning seat for a bot confrontation", async () => {
  const { accounts, store, tournamentId, matchId, alice, bob } = fixture;
  const roster = (
    await accounts.pool.query<{ id: string; account_id: string }>(
      "SELECT id,account_id FROM tournament_participants WHERE tournament_id=$1",
      [tournamentId],
    )
  ).rows;
  const humanId = roster.find((participant) => participant.account_id === alice)!.id;
  const botId = roster.find((participant) => participant.account_id === bob)!.id;
  await accounts.pool.query("UPDATE tournament_participants SET kind='bot',account_id=NULL WHERE id=$1", [botId]);
  await accounts.pool.query(
    "UPDATE tournament_matches SET player0_participant_id=$1,player1_participant_id=$2,player1_account_id=NULL WHERE id=$3",
    [humanId, botId, matchId],
  );
  expect((await store.scoreViews(tournamentId))[0]).toMatchObject({
    participantIds: [humanId, botId],
    participant0Id: alice,
    participant1Id: null,
    winnerSeat: null,
  });
  const resolved = await store.overrideResolution({
    tournamentId,
    matchId,
    mode: "decide",
    outcome: { officialResult: "participant1" },
    reason: "Bot won the confrontation",
    winsRequired: 2,
    seriesDurationMs: null,
    commandId: randomUUID(),
    now: START,
  });
  expect(resolved.ok).toBe(true);
  expect((await store.scoreViews(tournamentId))[0]).toMatchObject({
    participantIds: [humanId, botId],
    winnerSeat: 1,
    winnerParticipantId: null,
  });
});

it("refuses to start a waiting round even when both players request presence", async () => {
  await fixture.accounts.pool.query("UPDATE tournament_matches SET status='waiting' WHERE id=$1", [fixture.matchId]);
  for (const accountId of [fixture.alice, fixture.bob]) {
    expect(
      await fixture.store.markPresent({
        tournamentId: fixture.tournamentId,
        matchId: fixture.matchId,
        accountId,
        winsRequired: 2,
        seriesDurationMs: SERIES_DURATION_MS,
        now: START,
      }),
    ).toEqual({ ok: false, reason: "match_not_ready" });
  }
  expect(await fixture.store.seriesForMatch(fixture.matchId)).toBeUndefined();
});

it("rejects issued authorizations and late results after the tournament is cancelled", async () => {
  const series = await startSeries();
  const credentials = await fixture.store.authorizeNextGame({
    seriesId: series.id,
    accountId: fixture.alice,
    now: START + 6000,
  });
  expect(credentials.ok).toBe(true);
  if (!credentials.ok) {
    return;
  }
  await fixture.accounts.pool.query("UPDATE tournaments SET status='cancelled' WHERE id=$1", [fixture.tournamentId]);
  expect(
    await fixture.store.authorizeNextGame({ seriesId: series.id, accountId: fixture.bob, now: START + 7000 }),
  ).toEqual({ ok: false, reason: "tournament_cancelled" });
  expect(
    await fixture.store.claimGame({
      gameId: credentials.value.gameId,
      authorizationToken: credentials.value.token,
      roomId: "late-room",
      now: START + 7000,
    }),
  ).toEqual({ ok: false, reason: "tournament_cancelled" });
  expect(
    await fixture.store.recordGameResult({
      gameId: credentials.value.gameId,
      roomId: "late-room",
      outcome: { kind: "winner", winnerAccountId: fixture.alice },
      finishedAt: START + 8000,
    }),
  ).toEqual({ ok: false, reason: "tournament_cancelled" });
});
