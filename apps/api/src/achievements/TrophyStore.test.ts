import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { TrophyAward } from "@aegis/shared/achievements/TrophyAward";
import { TrophyTier } from "@aegis/shared/achievements/TrophyTier";
import { AccountStore } from "#api/accounts/AccountStore";
import { TrophyStore } from "#api/achievements/TrophyStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { RankedSeasonStore } from "#api/ranked/RankedSeasonStore";

type Player = { participantId: string; accountId: string };

let accounts: AccountStore;
let trophies: TrophyStore;
let tournamentId: string;
let standings: { participantId: string }[];

async function sweep(now = 5_000): Promise<number> {
  return trophies.sweepTournamentTrophies({ standings: async () => standings, now });
}

async function createTournament(name: string): Promise<string> {
  const organizer = await accounts.accountForIdentity("email", `organizer-${randomUUID()}`, `Organizer ${name}`);
  const tournament = await accounts.createTournament(organizer.id, {
    name,
    block: "BT10",
    startsAt: 1_800_000_000_000,
    maxPlayers: 16,
    allowBots: true,
    bestOf: 1,
    rules: buildTournamentRules({ bestOf: 1 }),
  });
  return tournament.id;
}

async function addPlayer(name: string): Promise<Player> {
  const account = await accounts.accountForIdentity(
    "email",
    `${name}-${randomUUID()}`,
    `${name}-${randomUUID().slice(0, 6)}`,
  );
  const participantId = randomUUID();
  await accounts.pool.query(
    "INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, status, created_at) VALUES ($1,$2,'human',$3,$4,'active',1)",
    [participantId, tournamentId, account.id, name],
  );
  return { participantId, accountId: account.id };
}

async function addBracketMatch(params: {
  phaseId: string;
  round: number;
  position: number;
  winner: Player;
  loser: Player;
}) {
  await accounts.pool.query(
    `INSERT INTO tournament_matches (id, tournament_id, phase_id, round, position, status, player0_participant_id, player1_participant_id, winner_participant_id)
     VALUES ($1,$2,$3,$4,$5,'finished',$6,$7,$6)`,
    [
      randomUUID(),
      tournamentId,
      params.phaseId,
      params.round,
      params.position,
      params.winner.participantId,
      params.loser.participantId,
    ],
  );
}

async function addPhase(kind: "swiss" | "top_cut"): Promise<string> {
  const phaseId = randomUUID();
  await accounts.pool.query(
    "INSERT INTO tournament_phases (id, tournament_id, kind, phase_order, status, created_at) VALUES ($1,$2,$3,$4,'finished',1)",
    [phaseId, tournamentId, kind, kind === "swiss" ? 1 : 2],
  );
  return phaseId;
}

async function finish(winner: Player, finishedAt = 4_000): Promise<void> {
  await accounts.pool.query("UPDATE tournaments SET status='finished' WHERE id=$1", [tournamentId]);
  await accounts.pool.query(
    `INSERT INTO tournament_events (id, tournament_id, sequence, actor_kind, actor_id, command, command_id, reason, reason_code, participant_id, created_at)
     VALUES ($1,$2,1,'system','system','tournament_finished',$3,'done','done',$4,$5)`,
    [randomUUID(), tournamentId, `tournament_finished:${tournamentId}`, winner.participantId, finishedAt],
  );
}

async function tiersOf(player: Player): Promise<string[]> {
  return (await trophies.getTrophies(player.accountId)).items.map((trophy) => trophy.tier);
}

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  await accounts.ensureReady();
  trophies = new TrophyStore(accounts);
  standings = [];
  tournamentId = await createTournament("Lightning Cup");
});

describe("tournament trophies", () => {
  it("grants gold to the champion, silver to the top four and bronze to the top eight", async () => {
    const players = await Promise.all(["A", "B", "C", "D", "E", "F", "G", "H"].map((name) => addPlayer(name)));
    const [a, b, c, d, e, f, g, h] = players as [Player, Player, Player, Player, Player, Player, Player, Player];
    const phaseId = await addPhase("top_cut");
    await addBracketMatch({ phaseId, round: 1, position: 0, winner: a, loser: e });
    await addBracketMatch({ phaseId, round: 1, position: 1, winner: b, loser: f });
    await addBracketMatch({ phaseId, round: 1, position: 2, winner: c, loser: g });
    await addBracketMatch({ phaseId, round: 1, position: 3, winner: d, loser: h });
    await addBracketMatch({ phaseId, round: 2, position: 0, winner: a, loser: b });
    await addBracketMatch({ phaseId, round: 2, position: 1, winner: c, loser: d });
    await addBracketMatch({ phaseId, round: 3, position: 0, winner: a, loser: c });
    await finish(a);

    expect(await sweep()).toBe(8);

    expect(await tiersOf(a)).toEqual([TrophyTier.GOLD.value]);
    for (const player of [b, c, d]) {
      expect(await tiersOf(player)).toEqual([TrophyTier.SILVER.value]);
    }
    for (const player of [e, f, g, h]) {
      expect(await tiersOf(player)).toEqual([TrophyTier.BRONZE.value]);
    }
    expect((await trophies.getTrophies(a.accountId)).items[0]).toEqual({
      award: TrophyAward.TOURNAMENT_CHAMPION.value,
      tier: TrophyTier.GOLD.value,
      source: { kind: "tournament", tournamentId, name: "Lightning Cup" },
      awardedAt: 4_000,
    });
  });

  it("awards only the highest placement when the champion also leads the standings", async () => {
    const leader = await addPlayer("Leader");
    const runnerUp = await addPlayer("RunnerUp");
    const ninth = await addPlayer("Ninth");
    standings = [leader, runnerUp, ...Array.from({ length: 6 }, () => ({ participantId: randomUUID() })), ninth];
    await finish(leader);

    await sweep();

    expect(await tiersOf(leader)).toEqual([TrophyTier.GOLD.value]);
    expect(await tiersOf(runnerUp)).toEqual([TrophyTier.SILVER.value]);
    expect(await tiersOf(ninth)).toEqual([]);
  });

  it("grants nothing twice when the sweep runs again or a tournament is replayed", async () => {
    const winner = await addPlayer("Winner");
    const loser = await addPlayer("Loser");
    const phaseId = await addPhase("top_cut");
    await addBracketMatch({ phaseId, round: 1, position: 0, winner, loser });
    await finish(winner);

    expect(await sweep()).toBe(2);
    expect(await sweep(60_000)).toBe(0);
    await accounts.pool.query("DELETE FROM tournament_trophy_grants");
    expect(await sweep(120_000)).toBe(0);

    expect(await tiersOf(winner)).toEqual([TrophyTier.GOLD.value]);
    expect(await tiersOf(loser)).toEqual([TrophyTier.SILVER.value]);
  });

  it("ignores tournaments that have not finished", async () => {
    const player = await addPlayer("Waiting");
    standings = [player];

    expect(await sweep()).toBe(0);
    expect(await tiersOf(player)).toEqual([]);
  });
});

describe("ranked season cosmetics", () => {
  it("excludes historical season trophies from the tournament cabinet", async () => {
    const player = await accounts.accountForIdentity("email", "past-winner", "Past winner");
    await accounts.pool.query("INSERT INTO ranked_seasons (id, starts_at, ends_at) VALUES (1, 0, 1000)");
    await accounts.pool.query(
      "INSERT INTO player_trophies (account_id,source_kind,source_key,award,tier,season_id,format,awarded_at) VALUES ($1,'ranked_season','1:standard','ranked_season_first','rainbow',1,'standard',1500)",
      [player.id],
    );

    expect((await trophies.getTrophies(player.id)).items).toEqual([]);
  });

  it("finalizes seasons without granting trophies", async () => {
    const seasons = new RankedSeasonStore(accounts);
    const leader = await accounts.accountForIdentity("email", "leader", "Leader");
    const runnerUp = await accounts.accountForIdentity("email", "runner-up", "RunnerUp");
    const provisional = await accounts.accountForIdentity("email", "provisional", "Provisional");
    await accounts.pool.query("INSERT INTO ranked_seasons (id, starts_at, ends_at) VALUES (1, 0, 1000)");
    for (const [accountId, rating, wins] of [
      [leader.id, 1500, 12],
      [runnerUp.id, 1400, 15],
      [provisional.id, 1900, 3],
    ] as const) {
      await accounts.pool.query(
        "INSERT INTO ranked_standings (season_id, account_id, format, region, rating, peak_rating, wins) VALUES (1,$1,'standard','south_america',$2,$2,$3)",
        [accountId, rating, wins],
      );
    }

    await seasons.finalizeSeasons(2_000);
    await seasons.finalizeSeasons(3_000);

    expect((await accounts.pool.query("SELECT * FROM player_trophies")).rows).toEqual([]);
    expect((await trophies.getTrophies(leader.id)).items).toEqual([]);
    expect((await seasons.getSeasons(2_000))[0]?.finalized).toBe(true);
    expect((await trophies.getTrophies(runnerUp.id)).items).toEqual([]);
    expect((await trophies.getTrophies(provisional.id)).items).toEqual([]);
  });
});
