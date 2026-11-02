import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";

import type { DiscordMessage, DiscordRestClient } from "#api/tournaments/discord/DiscordRestClient";
import { DiscordRequestError } from "#api/tournaments/discord/DiscordRequestError";
import { syncTournamentDiscord } from "#api/tournaments/discord/syncTournamentDiscord";
import type { TournamentDiscordConfig } from "#api/tournaments/discord/TournamentDiscordConfig";

type Sent = { channelId: string; message: DiscordMessage };

const CONFIG: TournamentDiscordConfig = {
  token: "test-token",
  channelId: "100000000000000001",
  guildId: "100000000000000002",
  webUrl: "https://aegis.test",
  roles: {
    participant: "200000000000000001",
    champion: "200000000000000002",
    top_four: "200000000000000003",
  },
};

let accounts: AccountStore;
let tournamentId: string;
let sent: Sent[];
let channels: string[];
let roleChanges: string[];
let failNextPost: boolean;
let standings: { participantId: string }[];

const discord: DiscordRestClient = {
  async postMessage(channelId, message) {
    if (failNextPost) {
      failNextPost = false;
      throw new DiscordRequestError(429, 5000);
    }
    sent.push({ channelId, message });
    return { id: `message-${sent.length}` };
  },
  async ensureTournamentChannel({ topic }) {
    let index = channels.indexOf(topic);
    if (index < 0) {
      channels.push(topic);
      index = channels.length - 1;
    }
    return { id: String(BigInt("300000000000000001") + BigInt(index)), guildId: CONFIG.guildId! };
  },
  async addMemberRole(_guildId, userId, roleId) {
    roleChanges.push(`+${userId}:${roleId}`);
  },
  async removeMemberRole(_guildId, userId, roleId) {
    roleChanges.push(`-${userId}:${roleId}`);
  },
};

async function sync(now = 1_000): Promise<number> {
  return syncTournamentDiscord({ db: accounts.pool, config: CONFIG, discord, standings: async () => standings, now });
}

async function createTournament(announce = true): Promise<string> {
  const organizer = await accounts.accountForIdentity("discord", "400000000000000001", "Organizer");
  const tournament = await accounts.createTournament(organizer.id, {
    name: "Lightning Cup",
    block: "BT10",
    startsAt: 1_800_000_000_000,
    maxPlayers: 8,
    allowBots: true,
    bestOf: 1,
    rules: buildTournamentRules({ bestOf: 1 }),
  });
  await accounts.setTournamentDiscordAnnounce(tournament.id, announce);
  return tournament.id;
}

async function addPlayer(name: string, discordUserId?: string): Promise<{ participantId: string; accountId: string }> {
  const account = await accounts.accountForIdentity(discordUserId ? "discord" : "email", discordUserId ?? name, name);
  const participantId = randomUUID();
  await accounts.pool.query(
    "INSERT INTO tournament_participants (id, tournament_id, kind, account_id, display_name, status, created_at) VALUES ($1,$2,'human',$3,$4,'active',1)",
    [participantId, tournamentId, account.id, name],
  );
  return { participantId, accountId: account.id };
}

async function addPhase(kind: "swiss" | "top_cut"): Promise<string> {
  const phaseId = randomUUID();
  await accounts.pool.query(
    "INSERT INTO tournament_phases (id, tournament_id, kind, phase_order, status, created_at) VALUES ($1,$2,$3,$4,'running',1)",
    [phaseId, tournamentId, kind, kind === "swiss" ? 1 : 2],
  );
  return phaseId;
}

async function addMatch(params: {
  phaseId: string;
  round: number;
  position: number;
  status: string;
  seats: [string | null, string | null];
  winner?: string;
}): Promise<void> {
  await accounts.pool.query(
    `INSERT INTO tournament_matches (id, tournament_id, phase_id, round, position, status, player0_participant_id, player1_participant_id, winner_participant_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      randomUUID(),
      tournamentId,
      params.phaseId,
      params.round,
      params.position,
      params.status,
      params.seats[0],
      params.seats[1],
      params.winner ?? null,
    ],
  );
}

async function finish(winnerParticipantId: string): Promise<void> {
  await accounts.pool.query("UPDATE tournaments SET status='finished' WHERE id=$1", [tournamentId]);
  await accounts.pool.query(
    `INSERT INTO tournament_events (id, tournament_id, sequence, actor_kind, actor_id, command, command_id, reason, reason_code, participant_id, created_at)
     VALUES ($1,$2,1,'system','system','tournament_finished',$3,'done','done',$4,1)`,
    [randomUUID(), tournamentId, `tournament_finished:${tournamentId}`, winnerParticipantId],
  );
}

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  sent = [];
  channels = [];
  roleChanges = [];
  failNextPost = false;
  standings = [];
  tournamentId = await createTournament();
});

describe("tournament announcements", () => {
  it("announces a flagged tournament once in its own text channel", async () => {
    await sync();
    await sync(2_000);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.channelId).toBe("300000000000000001");
    expect(sent[0]!.message.embeds?.[0]).toMatchObject({
      title: "Lightning Cup",
      url: `https://aegis.test/tournaments/${tournamentId}`,
    });
    expect(channels).toEqual([`Aegis tournament ${tournamentId}`]);
  });

  it("keeps tournaments with identical names in separate channels", async () => {
    const otherId = await createTournament();
    await sync();
    expect(channels).toHaveLength(2);
    expect(new Set(sent.map((entry) => entry.channelId)).size).toBe(2);
    expect(channels).toEqual(
      expect.arrayContaining([`Aegis tournament ${tournamentId}`, `Aegis tournament ${otherId}`]),
    );
    expect(sent.every((entry) => entry.channelId !== CONFIG.channelId)).toBe(true);
  });

  it("retries an announcement in the existing tournament channel", async () => {
    failNextPost = true;
    await sync();
    expect(channels).toHaveLength(1);
    expect(
      (
        await accounts.pool.query("SELECT channel_id FROM tournament_discord_posts WHERE tournament_id=$1", [
          tournamentId,
        ])
      ).rows[0].channel_id,
    ).toBe("300000000000000001");
    await sync(121_000);
    expect(channels).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.channelId).toBe("300000000000000001");
  });

  it("moves an existing open thread to a dedicated channel and reposts its active round", async () => {
    const alice = await addPlayer("Alice");
    const bob = await addPlayer("Bob");
    const phaseId = await addPhase("swiss");
    await addMatch({
      phaseId,
      round: 1,
      position: 0,
      status: "pending",
      seats: [alice.participantId, bob.participantId],
    });
    await accounts.pool.query(
      "INSERT INTO tournament_discord_posts (tournament_id,announcement_message_id,thread_id,updated_at) VALUES ($1,'old-message','old-thread',1)",
      [tournamentId],
    );
    await accounts.pool.query(
      "INSERT INTO tournament_discord_rounds (tournament_id,phase_id,round,message_id,posted_at) VALUES ($1,$2,1,'old-round',1)",
      [tournamentId, phaseId],
    );
    await sync();
    expect(channels).toHaveLength(1);
    expect(sent).toHaveLength(2);
    expect(sent.every((entry) => entry.channelId === "300000000000000001")).toBe(true);
    expect(sent[1]!.message.content).toContain("## Round 1");
  });

  it("does not announce a tournament an admin has not flagged", async () => {
    await accounts.setTournamentDiscordAnnounce(tournamentId, false);
    await sync();
    expect(sent).toEqual([]);
  });

  it("retries a rate-limited announcement after Discord's delay", async () => {
    failNextPost = true;
    await sync(1_000);
    await sync(2_000);
    expect(sent).toEqual([]);

    await sync(1_000 + 120_000);
    expect(sent).toHaveLength(1);
  });
});

describe("round pairings", () => {
  it("posts a published round to the tournament channel with mentions for linked players", async () => {
    const alice = await addPlayer("Alice", "500000000000000001");
    const bob = await addPlayer("Bob_Guest");
    const carol = await addPlayer("Carol", "500000000000000003");
    const phaseId = await addPhase("swiss");
    await addMatch({
      phaseId,
      round: 1,
      position: 0,
      status: "pending",
      seats: [alice.participantId, bob.participantId],
    });
    await addMatch({ phaseId, round: 1, position: 1, status: "bye", seats: [carol.participantId, null] });

    await sync();
    await sync(20_000);

    const rounds = sent.filter(
      ({ channelId, message }) => channelId === "300000000000000001" && message.content?.startsWith("##"),
    );
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.message.content).toContain("## Round 1");
    expect(rounds[0]!.message.content).toContain("Table 1: <@500000000000000001> vs **Bob\\_Guest**");
    expect(rounds[0]!.message.content).toContain("Table 2: <@500000000000000003> has a bye");
    expect(rounds[0]!.message.allowedUserIds).toEqual(["500000000000000001", "500000000000000003"]);
  });

  it("waits until every bracket match of a round has both players", async () => {
    const alice = await addPlayer("Alice", "500000000000000001");
    const bob = await addPlayer("Bob", "500000000000000002");
    const phaseId = await addPhase("top_cut");
    await addMatch({
      phaseId,
      round: 1,
      position: 0,
      status: "pending",
      seats: [alice.participantId, bob.participantId],
    });
    await addMatch({ phaseId, round: 1, position: 1, status: "waiting", seats: [null, null] });

    await sync();
    expect(
      sent.filter(({ channelId, message }) => channelId === "300000000000000001" && message.content?.startsWith("##")),
    ).toEqual([]);

    await accounts.pool.query("UPDATE tournament_matches SET status='pending' WHERE status='waiting'");
    await sync(20_000);
    const rounds = sent.filter(
      ({ channelId, message }) => channelId === "300000000000000001" && message.content?.startsWith("##"),
    );
    expect(rounds[0]!.message.content).toContain("## Top Cut Semifinals");
  });
});

describe("placements and roles", () => {
  it("gives the participant role while registered, then swaps it for placement roles at the end", async () => {
    const alice = await addPlayer("Alice", "500000000000000001");
    const bob = await addPlayer("Bob", "500000000000000002");
    await sync();
    expect(roleChanges.sort()).toEqual([
      "+500000000000000001:200000000000000001",
      "+500000000000000002:200000000000000001",
    ]);

    roleChanges = [];
    const phaseId = await addPhase("top_cut");
    await addMatch({
      phaseId,
      round: 1,
      position: 0,
      status: "finished",
      seats: [alice.participantId, bob.participantId],
      winner: alice.participantId,
    });
    await finish(alice.participantId);
    await sync(20_000);

    expect(sent.at(-1)!.message.content).toContain("**Champion:** <@500000000000000001>");
    expect(sent.at(-1)!.message.content).toContain("**Top 4:** <@500000000000000002>");
    expect(roleChanges.sort()).toEqual([
      "+500000000000000001:200000000000000002",
      "+500000000000000002:200000000000000003",
      "-500000000000000001:200000000000000001",
      "-500000000000000002:200000000000000001",
    ]);
  });

  it("ranks a Swiss-only event from its final standings", async () => {
    const players = await Promise.all(
      ["Ana", "Ben", "Cid", "Dan", "Eve"].map((name, index) => addPlayer(name, `50000000000000001${index}`)),
    );
    standings = players.map(({ participantId }) => ({ participantId }));
    await sync();
    await finish(players[0]!.participantId);
    await sync(20_000);

    const placements = await accounts.pool.query<{ account_id: string; placement: string }>(
      "SELECT account_id, placement FROM tournament_discord_placements",
    );
    expect(Object.fromEntries(placements.rows.map((row) => [row.account_id, row.placement]))).toEqual({
      [players[0]!.accountId]: "champion",
      [players[1]!.accountId]: "top_four",
      [players[2]!.accountId]: "top_four",
      [players[3]!.accountId]: "top_four",
      [players[4]!.accountId]: "top_eight",
    });
  });
});
