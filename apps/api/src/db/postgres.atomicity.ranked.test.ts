import { syncRankedDiscordRoles } from "#api/ranked/syncRankedDiscordRoles";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { RankedStore } from "#api/ranked/RankedStore";
import { RankedSeasonStore } from "#api/ranked/RankedSeasonStore";
import { RankedRewardStore } from "#api/ranked/RankedRewardStore";
import { RankedRegion } from "@aegis/shared/ranked/RankedRegion";
import { RED_DECK } from "#api/engine/testDecks";
import { claimAccountRoom } from "#api/ranked/claimAccountRoom";

const connection = process.env.POSTGRES_TEST_URL ?? process.env.DATABASE_URL;
const schema = `ranked_test_${randomUUID().replaceAll("-", "")}`;
const now = Date.UTC(2026, 9, 20);
const region = RankedRegion.SOUTH_AMERICA.value;

describe("ranked integrity against Postgres", () => {
  let admin: Pool;
  let accounts: AccountStore;
  let queue: RankedStore;
  let first: string;
  let second: string;
  let deck0: string;
  let deck1: string;
  beforeAll(async () => {
    if (!connection) {
      throw new Error("POSTGRES_TEST_URL required");
    }
    admin = new Pool({ connectionString: connection });
    await admin.query(`CREATE SCHEMA ${schema}`);
    accounts = new AccountStore(new Pool({ connectionString: connection, options: `-c search_path=${schema}` }));
    await accounts.ensureReady();
    first = (await accounts.accountForIdentity("discord", "ranked-one", "Ranked One")).id;
    second = (await accounts.accountForIdentity("discord", "ranked-two", "Ranked Two")).id;
    deck0 = (await accounts.saveDeck(first, { name: "First", ...RED_DECK })).id;
    deck1 = (await accounts.saveDeck(second, { name: "Second", ...RED_DECK })).id;
  }, 60_000);
  beforeEach(async () => {
    await accounts.pool.query(
      "TRUNCATE ranked_queue,ranked_pair_players,ranked_pairs,ranked_standings,ranked_ratings,ranked_rewards,ranked_discord,ranked_seasons,competitive_match_facts,account_active_rooms,match_records CASCADE",
    );
    queue = new RankedStore(accounts, async () => `room-${randomUUID()}`);
  });
  afterAll(async () => {
    await accounts?.close();
    await admin?.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin?.end();
  });
  async function startPair(at = now) {
    await queue.joinQueue({ accountId: first, deckId: deck0, format: "BT10", region, slot: "blue", now: at });
    const secondView = await queue.joinQueue({
      accountId: second,
      deckId: deck1,
      format: "BT10",
      region,
      slot: "blue",
      now: at,
    });
    const firstView = await queue.pollQueue(first, at);
    const pairId = secondView.pairId!;
    const roomId = secondView.roomId!;
    await queue.claimSeat({ accountId: first, pairId, roomId, token: firstView.token!, now: at });
    await queue.claimSeat({ accountId: second, pairId, roomId, token: secondView.token!, now: at });
    expect(await queue.markPlaying(pairId, roomId, at)).toBe(true);
    return { pairId, roomId };
  }
  it("serializes duplicate queue requests and freezes the validated deck", async () => {
    const requests = await Promise.allSettled(
      [1, 2].map(() => queue.joinQueue({ accountId: first, deckId: deck0, format: "BT10", region, slot: "blue", now })),
    );
    expect(requests.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const pair = await queue.joinQueue({ accountId: second, deckId: deck1, format: "BT10", region, slot: "blue", now });
    const seat = await queue.pollQueue(first, now);
    await accounts.pool.query("UPDATE saved_decks SET name='Changed after queuing' WHERE account_id=$1", [first]);
    expect(
      await queue.claimSeat({ accountId: first, pairId: pair.pairId!, roomId: pair.roomId!, token: "bad", now }),
    ).toBeUndefined();
    expect(
      await queue.claimSeat({ accountId: first, pairId: pair.pairId!, roomId: pair.roomId!, token: seat.token!, now }),
    ).toMatchObject({ deck: { name: "First" } });
    expect(
      await queue.claimSeat({ accountId: first, pairId: pair.pairId!, roomId: pair.roomId!, token: seat.token!, now }),
    ).toBeUndefined();
    await accounts.pool.query("UPDATE saved_decks SET name='First' WHERE account_id=$1", [first]);
  });
  it("requeues the available opponent when a reservation expires and rejects its old credentials", async () => {
    await queue.joinQueue({ accountId: first, deckId: deck0, format: "BT10", region, slot: "blue", now });
    const pair = await queue.joinQueue({ accountId: second, deckId: deck1, format: "BT10", region, slot: "blue", now });
    await queue.pollQueue(first, now + 29_000);
    await queue.pollQueue(first, now + 58_000);
    expect(await queue.pollQueue(first, now + 60_001)).toMatchObject({ status: "waiting" });
    expect(
      await queue.claimSeat({
        accountId: second,
        pairId: pair.pairId!,
        roomId: pair.roomId!,
        token: pair.token!,
        now: now + 60_001,
      }),
    ).toBeUndefined();
    expect(await queue.pollQueue(second, now + 60_001)).toEqual({ status: "idle" });
  });
  it("updates Elo, history and season counters once and rolls all of them back on failure", async () => {
    const pair = await startPair();
    const result = {
      roomId: pair.roomId,
      rankedPairId: pair.pairId,
      format: "BT10" as const,
      mode: "ranked" as const,
      playerAccountIds: [first, second] as [string, string],
      winnerAccountId: first,
      reason: "surrender",
    };
    await accounts.pool.query("ALTER TABLE ranked_ratings ADD CONSTRAINT reject_rating CHECK (rating=1000)");
    await expect(accounts.recordMatch(result)).rejects.toThrow(/reject_rating/);
    expect(Number((await accounts.pool.query("SELECT COUNT(*) AS count FROM match_records")).rows[0].count)).toBe(0);
    await accounts.pool.query("ALTER TABLE ranked_ratings DROP CONSTRAINT reject_rating");
    expect(await accounts.recordMatch(result)).toBe(true);
    expect(await accounts.recordMatch(result)).toBe(false);
    const board = await new RankedSeasonStore(accounts).getLeaderboard({ format: "BT10", page: 1, accountId: first });
    expect(board.mine).toMatchObject({
      rating: 1016,
      wins: 1,
      losses: 0,
      draws: 0,
      provisional: true,
      peakRating: null,
    });
    expect(board.entries.find((entry) => entry.accountId === second)).toMatchObject({ rating: 984, losses: 1 });
  });
  it("waits for running games at season rollover, then grants one reward across formats", async () => {
    const pair = await startPair();
    const seasons = new RankedSeasonStore(accounts);
    const current = (await seasons.getSeasons(now))[0]!;
    await accounts.pool.query("UPDATE ranked_standings SET wins=9,peak_rating=NULL WHERE account_id=$1", [first]);
    await seasons.finalizeSeasons(current.endsAt + 1);
    expect((await new RankedRewardStore(accounts).getRewards(first)).items).toHaveLength(0);
    await accounts.recordMatch({
      roomId: pair.roomId,
      rankedPairId: pair.pairId,
      format: "BT10",
      mode: "ranked",
      playerAccountIds: [first, second],
      winnerAccountId: first,
      reason: "surrender",
    });
    await seasons.finalizeSeasons(current.endsAt + 1);
    await seasons.finalizeSeasons(current.endsAt + 2);
    const rewards = new RankedRewardStore(accounts);
    expect((await rewards.getRewards(first)).items).toMatchObject([{ seasonId: current.id, tier: "silver" }]);
    await rewards.equipReward({ accountId: first, seasonId: current.id });
    expect((await rewards.getRewards(first)).items[0]?.equipped).toBe(true);
    await expect(rewards.equipReward({ accountId: second, seasonId: current.id })).rejects.toThrow(
      "ranked_reward_not_owned",
    );
  });
  it("blocks a second room and entering queue while already playing", async () => {
    expect(await claimAccountRoom({ accounts, accountId: first, roomId: "existing" })).toBe(true);
    expect(await claimAccountRoom({ accounts, accountId: first, roomId: "other" })).toBe(false);
    await expect(
      queue.joinQueue({ accountId: first, deckId: deck0, format: "BT10", region, slot: "blue", now: Date.now() }),
    ).rejects.toThrow("ranked_already_playing");
  });
  it("preserves seated reservations through delayed readiness and freezes regional attribution", async () => {
    const pair = await startPair();
    await accounts.recordMatch({
      roomId: pair.roomId,
      rankedPairId: pair.pairId,
      mode: "ranked",
      format: "BT10",
      playerAccountIds: [first, second],
      reason: "draw",
    });
    const later = now + 200_000;
    await queue.joinQueue({
      accountId: first,
      deckId: deck0,
      format: "BT10",
      region: RankedRegion.EUROPE.value,
      slot: "blue",
      now: later,
    });
    const other = await queue.joinQueue({
      accountId: second,
      deckId: deck1,
      format: "BT10",
      region: RankedRegion.EUROPE.value,
      slot: "blue",
      now: later,
    });
    const one = await queue.pollQueue(first, later);
    expect(
      await queue.claimSeat({
        accountId: first,
        pairId: other.pairId!,
        roomId: other.roomId!,
        token: "é".repeat(64),
        now: later,
      }),
    ).toBeUndefined();
    await queue.claimSeat({
      accountId: first,
      pairId: other.pairId!,
      roomId: other.roomId!,
      token: one.token!,
      now: later + 10_000,
    });
    await queue.claimSeat({
      accountId: second,
      pairId: other.pairId!,
      roomId: other.roomId!,
      token: other.token!,
      now: later + 15_000,
    });
    await queue.sweepQueue(later + 65_000);
    expect(await queue.markPlaying(other.pairId!, other.roomId!, later + 75_000)).toBe(true);
    const regions = (
      await accounts.pool.query("SELECT region FROM ranked_pair_players WHERE pair_id=$1", [other.pairId])
    ).rows;
    expect(regions.map((entry) => entry.region)).toEqual([region, region]);
  });
  it("counts mirror games once for sample eligibility", async () => {
    const players = [first, second];
    for (let index = 0; index < 8; index++) {
      players.push((await accounts.accountForIdentity("discord", `sample-${index}`, `Sample ${index}`)).id);
    }
    for (let game = 0; game < 30; game++) {
      const matchId = `mirror-${game}`;
      for (let seat = 0; seat < 2; seat++) {
        const player = players[(game * 2 + seat) % players.length]!;
        const opponent = players[(game * 2 + 1 - seat) % players.length]!;
        await accounts.pool.query(
          "INSERT INTO competitive_match_facts (match_id,account_id,opponent_account_id,origin,format,region,archetype,opponent_archetype,classifier_version,result,finished_at) VALUES ($1,$2,$3,'ranked','BT10',$4,'Greymon','Greymon',1,$5,$6)",
          [matchId, player, opponent, region, seat === 0 ? "win" : "loss", now + game],
        );
      }
    }
    const seasons = new RankedSeasonStore(accounts);
    const filters = { origin: "ranked", format: "BT10", from: now, until: now + 15, page: 1 };
    expect((await seasons.getMatchups(filters))[0]).toMatchObject({ games: 15, players: 10, winrate: null });
    expect((await seasons.getMatchups({ ...filters, until: now + 31 }))[0]).toMatchObject({
      games: 30,
      players: 10,
      winrate: 0.5,
    });
  });
  it("removes last season's Discord entitlement when the next season is ineligible", async () => {
    const pair = await startPair();
    const seasons = new RankedSeasonStore(accounts);
    const current = (await seasons.getSeasons(now))[0]!;
    await accounts.pool.query("UPDATE ranked_standings SET wins=10,peak_rating=1250 WHERE account_id=$1", [first]);
    await accounts.pool.query("INSERT INTO ranked_discord (account_id,opted_in) VALUES ($1,true)", [first]);
    await accounts.recordMatch({
      roomId: pair.roomId,
      rankedPairId: pair.pairId,
      mode: "ranked",
      playerAccountIds: [first, second],
      reason: "draw",
    });
    await seasons.finalizeSeasons(current.endsAt + 1);
    expect(
      (await accounts.pool.query("SELECT desired_tier FROM ranked_discord WHERE account_id=$1", [first])).rows[0]
        .desired_tier,
    ).toBe("gold");
    await seasons.getSeasons(current.endsAt + 1);
    await seasons.finalizeSeasons(current.endsAt + 56 * 86_400_000 + 1);
    expect(
      (await accounts.pool.query("SELECT desired_tier FROM ranked_discord WHERE account_id=$1", [first])).rows[0]
        .desired_tier,
    ).toBeNull();
    expect((await new RankedRewardStore(accounts).getRewards(first)).items).toHaveLength(1);
  });
  it("retries Discord rate limits, applies only managed roles and removes roles on opt-out", async () => {
    const player = await accounts.accountForIdentity("discord", "1234567890", "Role Player");
    await accounts.pool.query(
      "INSERT INTO ranked_discord (account_id,opted_in,status,desired_tier) VALUES ($1,true,'pending','gold')",
      [player.id],
    );
    const env = {
      AEGIS_RANKED_DISCORD_GUILD_ID: "9876543210",
      AEGIS_DISCORD_BOT_TOKEN: "local-test-only",
      AEGIS_RANKED_DISCORD_ROLES: JSON.stringify({ bronze: "1", silver: "2", gold: "3", platinum: "4", diamond: "5" }),
    };
    const limited = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ retry_after: 900 }), { status: 429, headers: { "Retry-After": "900" } }),
      );
    await syncRankedDiscordRoles({ accounts, env, fetcher: limited, now });
    expect(limited).toHaveBeenCalledTimes(1);
    const failed = (
      await accounts.pool.query("SELECT attempts,retry_at FROM ranked_discord WHERE account_id=$1", [player.id])
    ).rows[0];
    expect(failed.attempts).toBe(1);
    expect(Number(failed.retry_at)).toBe(now + 900_000);
    const success = vi.fn<typeof fetch>().mockImplementation(async () => new Response(null, { status: 204 }));
    await syncRankedDiscordRoles({ accounts, env, fetcher: success, now: now + 1000 });
    expect(success).not.toHaveBeenCalled();
    await syncRankedDiscordRoles({ accounts, env, fetcher: success, now: now + 900_001 });
    expect(success).toHaveBeenCalledWith(
      expect.stringMatching(/roles\/3$/),
      expect.objectContaining({ method: "PUT" }),
    );
    expect(
      (await accounts.pool.query("SELECT status,applied_role FROM ranked_discord WHERE account_id=$1", [player.id]))
        .rows[0],
    ).toEqual({ status: "synced", applied_role: "3" });
    await new RankedRewardStore(accounts).setDiscordOptIn({ accountId: player.id, optedIn: false });
    success.mockClear();
    await syncRankedDiscordRoles({ accounts, env, fetcher: success, now: now + 900_002 });
    expect(success.mock.calls).toHaveLength(5);
    expect(success.mock.calls.every(([, init]) => init?.method === "DELETE")).toBe(true);
  });
  it("does not let stale client cleanup cancel another tab's search", async () => {
    const searchId = randomUUID();
    await queue.joinQueue({ accountId: first, deckId: deck0, format: "BT10", region, slot: "blue", now, searchId });
    await queue.cancelQueue(first, now, randomUUID());
    expect(await queue.pollQueue(first, now, searchId)).toMatchObject({ status: "waiting", searchId });
    expect(await queue.pollQueue(first, now, randomUUID())).toMatchObject({ status: "idle" });
    await queue.cancelQueue(first, now, searchId);
    expect(await queue.pollQueue(first, now)).toMatchObject({ status: "idle" });
  });
});
