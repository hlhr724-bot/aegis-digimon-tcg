import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import type { AccountStore, Deck } from "#api/accounts/AccountStore";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import { deckFormatSettings, formatIsUnlimited } from "@aegis/shared/deckFormat";
import type { TournamentBanlistCard } from "@aegis/shared/tournaments/index";
import type { RankedQueueView } from "@aegis/shared/ranked/RankedContracts";
import type { RankedRegion } from "@aegis/shared/ranked/RankedRegion";
import { RankedQueueStatus } from "@aegis/shared/ranked/RankedQueueStatus";
import { validateCompetitiveDeck } from "#api/tournaments/participants/deckLegality";
import { resolveBanlistPolicy } from "#api/tournaments/rules/banlistPolicy";
import { runRankedTransaction } from "#api/ranked/runRankedTransaction";
import { canPairRankedPlayers } from "#api/ranked/canPairRankedPlayers";
import { getRankedSeason } from "#api/ranked/getRankedSeason";

type Entry = {
  account_id: string;
  search_id: string;
  format: DeckFormat;
  region: RankedRegion;
  slot: string;
  rating: number;
  deck: Deck;
  banlist: TournamentBanlistCard[];
  queued_at: string;
  heartbeat_at: string;
  pair_id: string | null;
  token: string;
  joined: boolean;
};
type Pair = {
  id: string;
  room_id: string | null;
  format: DeckFormat;
  status: string;
  slot: string;
  created_at: string;
  reservation_expires_at: string;
  started_at: string | null;
};
type CreateRoom = (params: { pairId: string; format: DeckFormat }) => Promise<string>;
type JoinParams = {
  accountId: string;
  deckId: string;
  format: DeckFormat;
  region: RankedRegion;
  slot: string;
  searchId?: string;
  now?: number;
};
type ClaimParams = {
  accountId: string;
  pairId: string;
  token: string;
  roomId: string;
  now?: number;
  consume?: boolean;
};

export class RankedStore {
  constructor(
    private readonly accounts: AccountStore,
    private readonly createRoom?: CreateRoom,
  ) {}

  async joinQueue({
    accountId,
    deckId,
    format,
    region,
    slot,
    now = Date.now(),
    searchId = randomUUID(),
  }: JoinParams): Promise<RankedQueueView> {
    const deck = (await this.accounts.decks(accountId)).find((entry) => entry.id === deckId);
    const settings = deckFormatSettings(format);
    const policy =
      settings.set === "all" ? { mode: "current" as const } : { mode: "as_of_set" as const, setId: settings.set };
    const banlist = resolveBanlistPolicy(policy, now);
    if (formatIsUnlimited(format) || !deck || !validateCompetitiveDeck(deck, banlist, format).legal) {
      throw new Error("ranked_invalid_deck");
    }
    return runRankedTransaction({
      accounts: this.accounts,
      work: async (db) => {
        await this.cleanup(db, now);
        const existing = (await db.query<Entry>("SELECT * FROM ranked_queue WHERE account_id=$1", [accountId])).rows[0];
        if (existing) {
          if (existing.search_id === searchId) {
            return this.getView(db, accountId, now);
          }
          throw new Error("ranked_already_queued");
        }
        if (
          (await db.query("SELECT 1 FROM account_active_rooms WHERE account_id=$1 AND expires_at>$2", [accountId, now]))
            .rowCount
        ) {
          throw new Error("ranked_already_playing");
        }
        const busy = await db.query(
          "SELECT g.id FROM tournament_games g JOIN match_series s ON s.id=g.series_id JOIN tournament_matches m ON m.id=s.tournament_match_id WHERE g.status='playing' AND (m.player0_account_id=$1 OR m.player1_account_id=$1)",
          [accountId],
        );
        if (busy.rowCount) {
          throw new Error("ranked_already_playing");
        }
        const rating =
          (
            await db.query<{ rating: number }>("SELECT rating FROM ranked_ratings WHERE account_id=$1 AND format=$2", [
              accountId,
              format,
            ])
          ).rows[0]?.rating ?? 1000;
        await db.query(
          "INSERT INTO ranked_queue (account_id,format,region,slot,rating,deck,banlist,queued_at,heartbeat_at,token,search_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10)",
          [
            accountId,
            format,
            region,
            slot,
            rating,
            JSON.stringify(deck),
            JSON.stringify(banlist),
            now,
            randomBytes(32).toString("hex"),
            searchId,
          ],
        );
        return this.getView(db, accountId, now);
      },
    });
  }

  async sweepQueue(now = Date.now()): Promise<void> {
    await runRankedTransaction({ accounts: this.accounts, work: (db) => this.cleanup(db, now) });
  }

  async pollQueue(accountId: string, now = Date.now(), searchId?: string): Promise<RankedQueueView> {
    return runRankedTransaction({
      accounts: this.accounts,
      work: async (db) => {
        await this.cleanup(db, now);
        const entry = (await db.query<Entry>("SELECT * FROM ranked_queue WHERE account_id=$1", [accountId])).rows[0];
        if (searchId && entry?.search_id !== searchId) {
          return { status: RankedQueueStatus.IDLE.value };
        }
        await db.query("UPDATE ranked_queue SET heartbeat_at=$2 WHERE account_id=$1", [accountId, now]);
        return this.getView(db, accountId, now);
      },
    });
  }

  async cancelQueue(accountId: string, now = Date.now(), searchId?: string): Promise<void> {
    await runRankedTransaction({
      accounts: this.accounts,
      work: async (db) => {
        const entry = (await db.query<Entry>("SELECT * FROM ranked_queue WHERE account_id=$1", [accountId])).rows[0];
        if (searchId && entry?.search_id !== searchId) {
          return;
        }
        if (entry?.pair_id) {
          const pair = (await db.query<Pair>("SELECT * FROM ranked_pairs WHERE id=$1", [entry.pair_id])).rows[0];
          if (pair?.status === RankedQueueStatus.PLAYING.value) {
            throw new Error("ranked_already_playing");
          }
          await db.query("DELETE FROM account_active_rooms WHERE room_id=$1", [pair?.room_id]);
          await db.query("UPDATE ranked_pairs SET status=$2 WHERE id=$1", [
            entry.pair_id,
            RankedQueueStatus.VOID.value,
          ]);
          await db.query("UPDATE ranked_queue SET pair_id=NULL,joined=false,queued_at=$2 WHERE pair_id=$1", [
            entry.pair_id,
            now,
          ]);
        }
        await db.query("DELETE FROM ranked_queue WHERE account_id=$1", [accountId]);
      },
    });
  }

  async claimSeat({
    accountId,
    pairId,
    token,
    roomId,
    now = Date.now(),
    consume = true,
  }: ClaimParams): Promise<{ deck: Deck; banlist: TournamentBanlistCard[]; format: DeckFormat } | undefined> {
    return runRankedTransaction({
      accounts: this.accounts,
      work: async (db) => {
        const entry = (
          await db.query<Entry>("SELECT * FROM ranked_queue WHERE account_id=$1 AND pair_id=$2", [accountId, pairId])
        ).rows[0];
        const pair = (await db.query<Pair>("SELECT * FROM ranked_pairs WHERE id=$1", [pairId])).rows[0];
        if (
          !entry ||
          !pair ||
          pair.room_id !== roomId ||
          pair.status !== RankedQueueStatus.RESERVED.value ||
          entry.joined ||
          now >= Number(pair.reservation_expires_at) ||
          !/^[a-f0-9]{64}$/.test(token) ||
          token.length !== entry.token.length ||
          !timingSafeEqual(Buffer.from(token), Buffer.from(entry.token))
        ) {
          return undefined;
        }
        if (consume) {
          await db.query("UPDATE ranked_queue SET joined=true WHERE account_id=$1", [accountId]);
          const unjoined = await db.query("SELECT 1 FROM ranked_queue WHERE pair_id=$1 AND joined=false", [pairId]);
          if (!unjoined.rowCount) {
            await db.query("UPDATE ranked_pairs SET reservation_expires_at=$2 WHERE id=$1", [pairId, now + 90_000]);
          }
        }
        return { deck: entry.deck, banlist: entry.banlist, format: entry.format };
      },
    });
  }

  async markPlaying(pairId: string, roomId: string, now = Date.now()): Promise<boolean> {
    return runRankedTransaction({
      accounts: this.accounts,
      work: async (db) => {
        const entries = (await db.query<Entry>("SELECT * FROM ranked_queue WHERE pair_id=$1", [pairId])).rows;
        if (entries.length !== 2 || entries.some((entry) => !entry.joined)) {
          return false;
        }
        const season = getRankedSeason(now);
        await db.query("INSERT INTO ranked_seasons (id,starts_at,ends_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [
          season.id,
          season.startsAt,
          season.endsAt,
        ]);
        const updated = await db.query(
          "UPDATE ranked_pairs SET status=$3,started_at=$4,heartbeat_at=$4,season_id=$5 WHERE id=$1 AND room_id=$2 AND status=$6",
          [pairId, roomId, RankedQueueStatus.PLAYING.value, now, season.id, RankedQueueStatus.RESERVED.value],
        );
        if (!updated.rowCount) {
          return false;
        }
        for (const entry of entries) {
          const previous = (
            await db.query<{ region: string }>(
              "SELECT region FROM ranked_standings WHERE season_id=$1 AND account_id=$2 LIMIT 1",
              [season.id, entry.account_id],
            )
          ).rows[0];
          const region = previous?.region ?? entry.region;
          await db.query("UPDATE ranked_pair_players SET region=$3 WHERE pair_id=$1 AND account_id=$2", [
            pairId,
            entry.account_id,
            region,
          ]);
          await db.query(
            "INSERT INTO ranked_standings (season_id,account_id,format,region,rating) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
            [season.id, entry.account_id, entry.format, region, entry.rating],
          );
        }
        return true;
      },
    });
  }

  async heartbeat(pairId: string, roomId: string, now = Date.now()): Promise<void> {
    await this.accounts.ensureReady();
    await this.accounts.pool.query("UPDATE ranked_pairs SET heartbeat_at=$3 WHERE id=$1 AND room_id=$2 AND status=$4", [
      pairId,
      roomId,
      now,
      RankedQueueStatus.PLAYING.value,
    ]);
  }

  private async cleanup(db: PoolClient, now: number): Promise<void> {
    const expired = (
      await db.query<Pair>(
        "SELECT * FROM ranked_pairs WHERE (status=$1 AND reservation_expires_at<$3) OR (status=$2 AND heartbeat_at<$4)",
        [RankedQueueStatus.RESERVED.value, RankedQueueStatus.PLAYING.value, now, now - 120_000],
      )
    ).rows;
    for (const pair of expired) {
      await db.query("DELETE FROM account_active_rooms WHERE room_id=$1", [pair.room_id]);
      await db.query("UPDATE ranked_pairs SET status=$2 WHERE id=$1", [pair.id, RankedQueueStatus.VOID.value]);
      if (pair.status === RankedQueueStatus.RESERVED.value) {
        await db.query(
          "UPDATE ranked_queue SET pair_id=NULL,joined=false,queued_at=$2 WHERE pair_id=$1 AND heartbeat_at>$3",
          [pair.id, now, now - 30_000],
        );
      }
      await db.query("DELETE FROM ranked_queue WHERE pair_id=$1", [pair.id]);
    }
    await db.query("DELETE FROM ranked_queue WHERE pair_id IS NULL AND heartbeat_at<$1", [now - 30_000]);
  }

  private async getView(db: PoolClient, accountId: string, now: number): Promise<RankedQueueView> {
    const entry = (await db.query<Entry>("SELECT * FROM ranked_queue WHERE account_id=$1", [accountId])).rows[0];
    if (!entry) {
      return { status: RankedQueueStatus.IDLE.value };
    }
    if (!entry.pair_id && this.createRoom) {
      const candidates = (
        await db.query<Entry>(
          "SELECT * FROM ranked_queue WHERE pair_id IS NULL AND account_id<>$1 AND format=$2 AND slot=$3 ORDER BY queued_at",
          [accountId, entry.format, entry.slot],
        )
      ).rows;
      const first = {
        rating: entry.rating,
        queuedAt: Number(entry.queued_at),
        format: entry.format,
        region: entry.region,
        slot: entry.slot,
      };
      const candidate = candidates.find(
        (second) =>
          JSON.stringify(second.banlist) === JSON.stringify(entry.banlist) &&
          canPairRankedPlayers({ first, second: { ...second, queuedAt: Number(second.queued_at) }, now }),
      );
      if (candidate) {
        const pairId = randomUUID();
        await db.query(
          "INSERT INTO ranked_pairs (id,format,slot,status,created_at,heartbeat_at,reservation_expires_at) VALUES ($1,$2,$3,$4,$5,$5,$6)",
          [pairId, entry.format, entry.slot, RankedQueueStatus.RESERVED.value, now, now + 60_000],
        );
        const roomId = await this.createRoom({ pairId, format: entry.format });
        await db.query("UPDATE ranked_pairs SET room_id=$2 WHERE id=$1", [pairId, roomId]);
        for (const [seat, player] of [candidate, entry].entries()) {
          await db.query("UPDATE ranked_queue SET pair_id=$2 WHERE account_id=$1", [player.account_id, pairId]);
          await db.query("INSERT INTO ranked_pair_players (pair_id,account_id,seat,region) VALUES ($1,$2,$3,$4)", [
            pairId,
            player.account_id,
            seat,
            player.region,
          ]);
        }
        entry.pair_id = pairId;
      }
    }
    const base = {
      searchId: entry.search_id,
      format: entry.format,
      region: entry.region,
      rating: entry.rating,
      queuedAt: Number(entry.queued_at),
    };
    if (!entry.pair_id) {
      return { ...base, status: RankedQueueStatus.WAITING.value };
    }
    const pair = (await db.query<Pair>("SELECT * FROM ranked_pairs WHERE id=$1", [entry.pair_id])).rows[0]!;
    return {
      ...base,
      status: pair.status as RankedQueueView["status"],
      pairId: pair.id,
      roomId: pair.room_id ?? undefined,
      token: entry.token,
      slot: pair.slot,
    };
  }
}
