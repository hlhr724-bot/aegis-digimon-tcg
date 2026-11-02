import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";

import { TournamentResultStore } from "#api/tournaments/results/TournamentResultStore";

type Player = { participantId: string; accountId: string | null; name: string };

const FINISHED_AT = Date.UTC(2026, 9, 20);
const DECK = {
  deckId: null,
  name: "Red",
  mainDeck: ["BT1-010", "BT1-010", "BT1-084"],
  eggDeck: ["BT1-001"],
  revision: 1,
};

let accounts: AccountStore;
let store: TournamentResultStore;
let tournamentId: string;
let organizerId: string;
let standings: { participantId: string }[];

async function sweep(now = FINISHED_AT + 1_000): Promise<number> {
  return store.sweepFinishedTournaments({ standings: async () => standings, now });
}

async function createTournament(name: string): Promise<string> {
  const organizer = await accounts.accountForIdentity("email", `organizer-${randomUUID()}`, `Organizer ${name}`);
  organizerId = organizer.id;
  const tournament = await accounts.createTournament(organizer.id, {
    name,
    block: "BT10",
    startsAt: FINISHED_AT - 3_600_000,
    maxPlayers: 16,
    allowBots: true,
    bestOf: 1,
    rules: buildTournamentRules({ bestOf: 1 }),
  });
  return tournament.id;
}

async function addPlayer(name: string, kind: "human" | "bot" = "human", status = "active"): Promise<Player> {
  const account =
    kind === "human"
      ? await accounts.accountForIdentity("email", `${name}-${randomUUID()}`, `${name}-${randomUUID().slice(0, 6)}`)
      : null;
  const participantId = randomUUID();
  await accounts.pool.query(
    "INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, status, deck_snapshot, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,1)",
    [participantId, tournamentId, kind, account?.id ?? null, name, status, JSON.stringify(DECK)],
  );
  return { participantId, accountId: account?.id ?? null, name };
}

async function addPhase(plannedRounds: number): Promise<string> {
  const phaseId = randomUUID();
  await accounts.pool.query(
    "INSERT INTO tournament_phases (id, tournament_id, kind, phase_order, status, planned_rounds, created_at) VALUES ($1,$2,'single_elimination',1,'finished',$3,$4)",
    [phaseId, tournamentId, plannedRounds, FINISHED_AT - 3_000_000],
  );
  return phaseId;
}

async function addMatch(params: { phaseId: string; round: number; position: number; winner: Player; loser: Player }) {
  const matchId = randomUUID();
  await accounts.pool.query(
    `INSERT INTO tournament_matches (id, tournament_id, phase_id, round, position, status, player0_participant_id, player1_participant_id, winner_participant_id)
     VALUES ($1,$2,$3,$4,$5,'finished',$6,$7,$6)`,
    [
      matchId,
      tournamentId,
      params.phaseId,
      params.round,
      params.position,
      params.winner.participantId,
      params.loser.participantId,
    ],
  );
  await accounts.pool.query(
    "INSERT INTO match_series (id, tournament_match_id, wins_required, wins0, wins1, status, started_at) VALUES ($1,$2,1,1,0,'resolved',1)",
    [randomUUID(), matchId],
  );
  for (const [player, outcome, opponent] of [
    [params.winner, "win", params.loser],
    [params.loser, "loss", params.winner],
  ] as const) {
    await accounts.pool.query(
      "INSERT INTO tournament_result_ledger (id, tournament_id, participant_id, opponent_id, opponent_kind, round_number, outcome, recorded_at) VALUES ($1,$2,$3,$4,'human',$5,$6,1)",
      [randomUUID(), tournamentId, player.participantId, opponent.participantId, params.round, outcome],
    );
  }
}

async function finish(winner: Player, status = "finished"): Promise<void> {
  await accounts.pool.query("UPDATE tournaments SET status=$2 WHERE id=$1", [tournamentId, status]);
  await accounts.pool.query(
    `INSERT INTO tournament_events (id, tournament_id, sequence, actor_kind, actor_id, command, command_id, reason, reason_code, participant_id, created_at)
     VALUES ($1,$2,1,'system','system','tournament_finished',$3,'done','done',$4,$5)`,
    [randomUUID(), tournamentId, `tournament_finished:${tournamentId}`, winner.participantId, FINISHED_AT],
  );
}

async function playFourPlayerCup(players: readonly [Player, Player, Player, Player]): Promise<void> {
  const [a, b, c, d] = players;
  const phaseId = await addPhase(2);
  await addMatch({ phaseId, round: 1, position: 0, winner: a, loser: b });
  await addMatch({ phaseId, round: 1, position: 1, winner: c, loser: d });
  await addMatch({ phaseId, round: 2, position: 0, winner: a, loser: c });
  await finish(a);
}

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  await accounts.ensureReady();
  store = new TournamentResultStore(accounts);
  standings = [];
  tournamentId = await createTournament("Weekly Cup");
});

describe("tournament result export", () => {
  it("freezes the event, placements, decklists and every pairing once", async () => {
    const alice = await addPlayer("Alice");
    const bot = await addPlayer("Bot", "bot");
    const carla = await addPlayer("Carla");
    const dmitri = await addPlayer("Dmitri", "human", "dropped");
    await playFourPlayerCup([alice, bot, carla, dmitri]);
    await sweep();

    const found = await store.findExport(tournamentId);

    expect(found).toMatchObject({ kind: "found", organizerId });
    const payload = found.kind === "found" ? found.payload : null;
    expect(payload).toMatchObject({
      schemaVersion: 1,
      event: {
        id: tournamentId,
        name: "Weekly Cup",
        organizerDisplayName: "Organizer Weekly Cup",
        category: "community",
        format: "standard",
        cardPool: "all",
        deckRules: "standard",
        structure: "single_elimination",
        bestOf: 1,
        startedAt: FINISHED_AT - 3_000_000,
        finishedAt: FINISHED_AT,
      },
    });
    const rows = (payload?.participants ?? []).map((entry) => [
      entry.displayName,
      entry.kind,
      entry.placement,
      entry.wins,
      entry.losses,
      entry.dropped,
    ]);
    expect(rows.slice(0, 2)).toEqual([
      ["Alice", "human", 1, 2, 0, false],
      ["Carla", "human", 2, 1, 1, false],
    ]);
    expect(rows.slice(2).sort((first, second) => String(first[0]).localeCompare(String(second[0])))).toEqual([
      ["Bot", "bot", 3, 0, 1, false],
      ["Dmitri", "human", 3, 0, 1, true],
    ]);
    expect(payload?.participants.find((entry) => entry.kind === "bot")?.accountId).toBeNull();
    expect(payload?.participants[0]?.decklist).toEqual({
      mainDeck: [
        { cardId: "BT1-010", count: 2 },
        { cardId: "BT1-084", count: 1 },
      ],
      eggDeck: [{ cardId: "BT1-001", count: 1 }],
    });
    expect(payload?.matches).toEqual([
      {
        round: 1,
        phase: "single_elimination",
        table: 1,
        player1ParticipantId: alice.participantId,
        player2ParticipantId: bot.participantId,
        player1GamesWon: 1,
        player2GamesWon: 0,
        winnerParticipantId: alice.participantId,
        result: "player1",
        bye: false,
      },
      expect.objectContaining({ round: 1, table: 2, winnerParticipantId: carla.participantId }),
      expect.objectContaining({ round: 2, table: 1, winnerParticipantId: alice.participantId, result: "player1" }),
    ]);
  });

  it("saves the export once even when the sweep runs again", async () => {
    const players = await Promise.all(["A", "B", "C", "D"].map((name) => addPlayer(name)));
    await playFourPlayerCup(players as [Player, Player, Player, Player]);

    expect(await sweep()).toBe(1);
    expect(await sweep(FINISHED_AT + 60_000)).toBe(0);

    expect((await accounts.pool.query("SELECT * FROM tournament_result_exports")).rows).toHaveLength(1);
  });

  it("skips cancelled events", async () => {
    const players = await Promise.all(["A", "B", "C", "D"].map((name) => addPlayer(name)));
    const [a, b] = players as [Player, Player, Player, Player];
    const phaseId = await addPhase(2);
    await addMatch({ phaseId, round: 1, position: 0, winner: a, loser: b });
    await finish(a, "cancelled");

    expect(await sweep()).toBe(0);
    expect((await accounts.pool.query("SELECT * FROM tournament_result_exports")).rows).toEqual([]);
  });

  it("reports a missing export until the event is finished", async () => {
    expect(await store.findExport(tournamentId)).toEqual({ kind: "found", organizerId, payload: null });
    expect(await store.findExport(randomUUID())).toEqual({ kind: "not_found" });
  });
});
