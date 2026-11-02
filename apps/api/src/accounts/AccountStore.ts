import type { TournamentStatus } from "@aegis/shared/tournaments/index";
import { TournamentRoundStartMode } from "@aegis/shared/tournaments/TournamentRoundStartMode";
import { getDeckStatsMatchLimit } from "@aegis/shared/decks/getDeckStatsMatchLimit";
import { grantTournamentTrophies } from "#api/achievements/grantTournamentTrophies";
import { isTournamentSpectatorPolicy } from "@aegis/shared/tournaments/isTournamentSpectatorPolicy";
import { TournamentSpectatorPolicy } from "@aegis/shared/tournaments/TournamentSpectatorPolicy";
import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import { isTournamentDeletable } from "#api/tournaments/lifecycle/isTournamentDeletable";
import { recordRankedResult } from "#api/ranked/recordRankedResult";
import { recordCompetitiveFacts } from "#api/ranked/recordCompetitiveFacts";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import type { DeckPerformanceRecord } from "@aegis/shared/decks/DeckPerformanceRecord";
import { getDeckPerformanceRecords } from "#api/accounts/getDeckPerformanceRecords";
import { buildDeckCompositionSignature } from "#api/accounts/buildDeckCompositionSignature";
import { getDeckFeaturedCardId } from "#api/accounts/getDeckFeaturedCardId";
import { getStoredMatchOwnDeck } from "#api/accounts/getStoredMatchOwnDeck";
import type { DeckHistoryDetails } from "@aegis/shared/decks/DeckHistoryDetails";
import { getDeckRecentResults } from "#api/accounts/getDeckRecentResults";
import { getDeckMatchWinRate } from "#api/accounts/getDeckMatchWinRate";
import { buildDeckCompositionKey } from "#api/accounts/buildDeckCompositionKey";
import type { SpectatorAccess } from "@aegis/shared/account/SpectatorAccess";
import type { AccountRole } from "@aegis/shared/account/AccountRole";
import { isAccountRole } from "@aegis/shared/account/isAccountRole";
import { hasAccountCapability } from "@aegis/shared/account/hasAccountCapability";
import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
import type { CardImageLanguage } from "@aegis/shared/cards/CardImageLanguage";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  AvatarChoice,
  AvatarSource,
  BanlistPolicy,
  DigimonWorldAvatarId,
  MatchHistoryRecord,
  MatchHistoryFilter,
  MatchHistorySummary,
  MatchWinRate,
  TournamentBanlistCard,
  TournamentRules,
  TournamentStructure,
} from "@aegis/shared";
import { INITIALS_AVATAR, isDigimonWorldAvatarId, MATCH_HISTORY_LIMIT, resolveCardArt } from "@aegis/shared";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import type { BotExperimentRecord } from "#api/bot/experiment/BotExperimentRecord";
import { migrations } from "../db/migrations/index.js";
import { type Queryable, runMigrations } from "../db/migrator.js";

type LegacyMatchParams = { client: PoolClient; matchId: string };

type MatchDeckParams = { accountId: string; matchId: string };

export type Account = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  avatarId: DigimonWorldAvatarId | null;
  avatarSource: AvatarSource;
  /** Present when the player uploaded their own picture; the public URL embeds it to bust caches. */
  avatarImageVersion: number | null;
  roles: AccountRole[];
  isAdmin: boolean;
};
export type Deck = {
  id: string;
  name: string;
  mainDeck: string[];
  eggDeck: string[];
  mainDeckArts?: string[];
  eggDeckArts?: string[];
  coverCardId?: string;
  /** A card sleeve id from the web client's catalog; the api stores it without interpreting it. */
  sleeveId?: string;
  /** The Digi-Egg deck's sleeve id, stored the same way as `sleeveId`. */
  eggSleeveId?: string;
  format?: import("@aegis/shared").DeckFormat;
  revision: number;
  updatedAt: number;
};
export type AccountPreferences = {
  cardImageLanguage?: CardImageLanguage;
  autoHatch?: boolean;
  groupIdenticalTamers?: boolean;
  darkMode?: boolean;
  locale?: string;
  sleeve?: string;
  eggSleeve?: string;
  deckShare?: number;
  deckView?: "grid" | "list";
  deckSort?: string;
  profileStats?: boolean;
  profileTrophies?: boolean;
  shareProfileStats?: boolean;
  shareDeckAfterMatch?: boolean;
  listLiveMatches?: boolean;
  spectatorAccess?: SpectatorAccess;
  hideIdentityFromSpectators?: boolean;
  favoriteDeckIds?: string[];
};
export type AuthSession = { id: string; account: Account; expiresAt: number };
export type RoomTicket = { account: Account; tournamentMatchId: string | null };
export type PlayerStats = {
  rankedWins: number;
  rankedLosses: number;
  rankedDraws: number;
  rankedDodges: number;
  tournamentWins: number;
  tournamentLosses: number;
  tournamentDraws: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
};
export type DeckSnapshot = {
  deckId: string | null;
  deckName: string;
  mainDeck: string[];
  eggDeck: string[];
  mainDeckArts?: string[];
  eggDeckArts?: string[];
};
export type DeckStat = DeckSnapshot & {
  snapshotId: string;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
};
// Which SEAT won, rather than which account. A person who loses to a bot leaves
// `winner_account_id` null — the winner has no account — so a reader that infers the result from
// that column alone reports the loss as a draw. This says it outright.
export type MatchOutcomeSeat = "player0" | "player1" | "draw";
export type MatchRecord = MatchHistoryRecord;
export type StoredMatchRecord = MatchRecord &
  Partial<BotExperimentRecord> & {
    ownDeck?: UsedDeck;
    ownDeckId?: string | null;
    ownDeckName?: string;
    ownDeckKey?: string;
    ownDeckStartedAt?: number;
    opponentAccountId?: string;
    opponentDeck?: UsedDeck;
    opponentDeckOwnerAccountId?: string;
  };
export type Tournament = {
  roundStartMode: TournamentRoundStartMode;
  category: TournamentCategory;
  format: DeckFormat;
  passwordProtected: boolean;
  discordAnnounce: boolean;
  spectatorPolicy: TournamentSpectatorPolicy;
  id: string;
  name: string;
  description: string;
  block: string;
  status: Exclude<TournamentStatus, "running"> | "in_progress";
  startsAt: number;
  maxPlayers: number;
  createdBy: string;
  winnerAccountId: string | null;
  registrations: number;
  circuitId: string | null;
  autoStart: boolean;
} & TournamentProgram;
// The tournament-program columns (migrations 002 and 003), read back as the shared contract shapes.
// Legacy rows carry exactly what the backfills gave them, so this is never partially populated.
export type TournamentProgram = {
  structure: TournamentStructure;
  bestOf: 1 | 3;
  topCutEnabled: boolean;
  topCutSize: number | null;
  allowBots: boolean;
  randomBotStyles: boolean;
  rules: TournamentRules | null;
  banlistPolicy: BanlistPolicy;
  banlistCards: TournamentBanlistCard[];
};
// The program fields are optional and default to the pre-program bracket — single elimination,
// best-of-one, no Top Cut, no bots, no banlist enforcement — which is also what migration 003
// backfills legacy rows to. A caller that omits them creates exactly what it always created.
export type CreateTournamentRecord = {
  roundStartMode?: TournamentRoundStartMode;
  category?: TournamentCategory;
  format?: DeckFormat;
  passwordHash?: string | null;
  description?: string;
  name: string;
  block: string;
  startsAt: number;
  maxPlayers: number;
  id?: string;
  circuitId?: string;
  autoStart?: boolean;
  registrationClosesAt?: number;
  checkInOpensAt?: number;
  checkInClosesAt?: number;
} & Partial<Omit<TournamentProgram, "topCutSize">>;
export const LEGACY_TOURNAMENT_PROGRAM: Omit<TournamentProgram, "topCutSize"> = {
  structure: "single_elimination",
  bestOf: 1,
  topCutEnabled: false,
  allowBots: false,
  randomBotStyles: false,
  rules: null,
  banlistPolicy: { mode: "none" },
  banlistCards: [],
};
export type TournamentMatch = {
  id: string;
  round: number;
  position: number;
  player0AccountId: string | null;
  player1AccountId: string | null;
  winnerAccountId: string | null;
  status: "waiting" | "pending" | "finished" | "bye";
};
export type DiscordAvatarCheck = { accountId: string; discordUserId: string; previousCheckedAt: number | null };
export const MAX_SAVED_DECKS = 100;
export class DeckLimitError extends Error {}
export class DisplayNameTakenError extends Error {}
export class InvalidDisplayNameError extends Error {}

const MAGIC_LINK_SHORT_WINDOW_MS = 900_000;
const MAGIC_LINK_DAY_WINDOW_MS = 86_400_000;

type AccountRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_id: AvatarChoice;
  avatar_image_version: string | null;
  roles: string[];
};

export const ROOM_TICKET_LIFETIME_MS = 60_000;
export const ROOM_TICKET_RETENTION_MS = 24 * 60 * 60 * 1000;
const ROOM_TICKET_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const ROOM_TICKET_CLEANUP_BATCH = 5_000;

export class AccountStore {
  private lastMagicLinkCleanup = 0;
  private lastRoomTicketCleanup = 0;
  // Exposed so sibling domain stores (see src/tournaments/participants) can share one connection
  // pool and one migration run instead of opening a second pool against the same database.
  readonly pool: Pool;
  private ready: Promise<void> | undefined;

  constructor(input: Pool | PoolConfig | string = process.env.DATABASE_URL ?? {}) {
    this.pool =
      typeof input === "object" && "connect" in input && "query" in input
        ? (input as Pool)
        : new Pool(typeof input === "string" ? { connectionString: input } : input);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
  async healthCheck(): Promise<boolean> {
    await this.pool.query("SELECT 1");
    return true;
  }

  // Discards the cached promise on failure so a transient error (database still starting, lock
  // contention, dropped connection) is retried by the next caller instead of poisoning the store
  // for the lifetime of the process.
  ensureReady(): Promise<void> {
    this.ready ??= runMigrations(this.pool, migrations)
      .then(() => undefined)
      .catch((error: unknown) => {
        this.ready = undefined;
        throw error;
      });
    return this.ready;
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    await this.ensureReady();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async accountForIdentity(
    provider: "discord" | "email",
    subject: string,
    displayName: string,
    avatarUrl: string | null = null,
  ): Promise<Account> {
    const normalized = provider === "email" ? subject.trim().toLowerCase() : subject;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.transaction(async (client) => {
          const existing = await client.query<AccountRow>(
            "SELECT a.id, a.display_name, a.avatar_url, a.avatar_id, a.avatar_image_version, a.roles FROM accounts a JOIN login_identities i ON i.account_id=a.id WHERE i.provider=$1 AND i.subject=$2",
            [provider, normalized],
          );
          const row = existing.rows[0];
          if (row) {
            // Discord avatar URLs embed a hash that changes with every upload, so refresh it on each login.
            if (provider !== "discord") return toAccount(row);
            await client.query("UPDATE accounts SET avatar_url=$1, avatar_checked_at=$2 WHERE id=$3", [
              avatarUrl,
              Date.now(),
              row.id,
            ]);
            return toAccount({ ...row, avatar_url: avatarUrl });
          }
          const account: Account = {
            id: randomUUID(),
            displayName: await this.uniqueName(client, displayName),
            avatarUrl,
            avatarId: null,
            avatarSource: avatarUrl ? "discord" : "initials",
            avatarImageVersion: null,
            roles: [],
            isAdmin: false,
          };
          const now = Date.now();
          await client.query(
            "INSERT INTO accounts (id, display_name, avatar_url, avatar_checked_at, created_at) VALUES ($1,$2,$3,$4,$5)",
            [account.id, account.displayName, account.avatarUrl, provider === "discord" ? now : null, now],
          );
          await client.query("INSERT INTO login_identities (provider, subject, account_id) VALUES ($1,$2,$3)", [
            provider,
            normalized,
            account.id,
          ]);
          return account;
        });
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 2) throw error;
      }
    }
    throw new Error("could not allocate account identity");
  }

  async issueSession(account: Account): Promise<AuthSession> {
    await this.ensureReady();
    const id = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + 2_592_000_000;
    await this.pool.query("INSERT INTO sessions (id, account_id, expires_at) VALUES ($1,$2,$3)", [
      id,
      account.id,
      expiresAt,
    ]);
    return { id, account, expiresAt };
  }
  async session(id: string | undefined): Promise<AuthSession | undefined> {
    if (!id) return undefined;
    await this.ensureReady();
    const result = await this.pool.query<AccountRow & { session_id: string; expires_at: string }>(
      "SELECT s.id session_id, s.expires_at, a.id, a.display_name, a.avatar_url, a.avatar_id, a.avatar_image_version, a.roles FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=$1 AND s.revoked_at IS NULL AND s.expires_at>$2",
      [id, Date.now()],
    );
    const row = result.rows[0];
    return row ? { id: row.session_id, expiresAt: Number(row.expires_at), account: toAccount(row) } : undefined;
  }
  /**
   * Claims Discord accounts whose avatar was never checked or was last checked before `staleBefore`.
   * Each claim stamps `avatar_checked_at` first, so concurrent API replicas never fetch the same account.
   */
  async claimDiscordAvatarChecks({
    staleBefore,
    limit,
    accountId,
  }: {
    staleBefore: number;
    limit: number;
    accountId?: string;
  }): Promise<DiscordAvatarCheck[]> {
    await this.ensureReady();
    const candidates = await this.pool.query<{ id: string; subject: string; avatar_checked_at: string | null }>(
      `SELECT a.id, i.subject, a.avatar_checked_at FROM accounts a JOIN login_identities i ON i.account_id=a.id
       WHERE i.provider='discord' AND (a.avatar_checked_at IS NULL OR a.avatar_checked_at<$1)${accountId ? " AND a.id=$3" : ""}
       ORDER BY a.created_at LIMIT $2`,
      accountId ? [staleBefore, limit, accountId] : [staleBefore, limit],
    );
    const claims: DiscordAvatarCheck[] = [];
    for (const candidate of candidates.rows) {
      const claimed = await this.pool.query(
        "UPDATE accounts SET avatar_checked_at=$1 WHERE id=$2 AND (avatar_checked_at IS NULL OR avatar_checked_at<$3) RETURNING id",
        [Date.now(), candidate.id, staleBefore],
      );
      if (claimed.rowCount)
        claims.push({
          accountId: candidate.id,
          discordUserId: candidate.subject,
          previousCheckedAt: candidate.avatar_checked_at === null ? null : Number(candidate.avatar_checked_at),
        });
    }
    return claims;
  }
  async discordUserId(accountId: string): Promise<string | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<{ subject: string }>(
      "SELECT subject FROM login_identities WHERE provider='discord' AND account_id=$1",
      [accountId],
    );
    return result.rows[0]?.subject;
  }
  async releaseDiscordAvatarCheck(check: DiscordAvatarCheck): Promise<void> {
    await this.ensureReady();
    await this.pool.query("UPDATE accounts SET avatar_checked_at=$1 WHERE id=$2", [
      check.previousCheckedAt,
      check.accountId,
    ]);
  }
  async setAvatarUrl(accountId: string, avatarUrl: string | null): Promise<void> {
    await this.ensureReady();
    await this.pool.query("UPDATE accounts SET avatar_url=$1 WHERE id=$2", [avatarUrl, accountId]);
  }
  async revokeSession(id: string | undefined): Promise<void> {
    if (id) {
      await this.ensureReady();
      await this.pool.query("UPDATE sessions SET revoked_at=$1 WHERE id=$2", [Date.now(), id]);
    }
  }

  async createRoomTicket(accountId: string, tournamentMatchId: string | null = null): Promise<string> {
    await this.ensureReady();
    const now = Date.now();
    if (now - this.lastRoomTicketCleanup >= ROOM_TICKET_CLEANUP_INTERVAL_MS) {
      this.lastRoomTicketCleanup = now;
      await removeExpiredRoomTickets(this.pool, now - ROOM_TICKET_RETENTION_MS);
    }
    const token = randomBytes(32).toString("base64url");
    await this.pool.query(
      "INSERT INTO room_tickets (token_hash, account_id, tournament_match_id, expires_at) VALUES ($1,$2,$3,$4)",
      [hash(token), accountId, tournamentMatchId, now + ROOM_TICKET_LIFETIME_MS],
    );
    return token;
  }
  async createTournamentMatchTicket(
    accountId: string,
    tournamentId: string,
    matchId: string,
  ): Promise<string | undefined> {
    const tournament = await this.tournament(tournamentId);
    if (!tournament || tournament.status === "cancelled" || tournament.status === "finished") {
      return undefined;
    }
    const match = (await this.tournamentMatches(tournamentId)).find((item) => item.id === matchId);
    if (!match || match.status !== "pending" || ![match.player0AccountId, match.player1AccountId].includes(accountId))
      return undefined;
    if (
      (await this.pool.query("SELECT 1 FROM tournament_phases WHERE tournament_id=$1 LIMIT 1", [tournamentId])).rowCount
    ) {
      return undefined;
    }
    return this.createRoomTicket(accountId, matchId);
  }
  async getRoomTicketAccountId(token: unknown): Promise<string | undefined> {
    if (typeof token !== "string" || !token || token.length > 256) {
      return undefined;
    }
    await this.ensureReady();
    const result = await this.pool.query<{ account_id: string }>(
      "SELECT account_id FROM room_tickets WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>$2 AND tournament_match_id IS NULL",
      [hash(token), Date.now()],
    );
    return result.rows[0]?.account_id;
  }

  async consumeRoomTicket(token: string | undefined): Promise<RoomTicket | undefined> {
    if (!token) return undefined;
    return this.transaction(async (client) => {
      const now = Date.now();
      const ticket = (
        await client.query<{ account_id: string; tournament_match_id: string | null }>(
          "SELECT account_id,tournament_match_id FROM room_tickets WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>$2 FOR UPDATE",
          [hash(token), now],
        )
      ).rows[0];
      if (!ticket) return undefined;
      await client.query("UPDATE room_tickets SET consumed_at=$1 WHERE token_hash=$2", [now, hash(token)]);
      const row = (
        await client.query<AccountRow>(
          "SELECT id,display_name,avatar_url,avatar_id,avatar_image_version,roles FROM accounts WHERE id=$1",
          [ticket.account_id],
        )
      ).rows[0];
      return row ? { account: toAccount(row), tournamentMatchId: ticket.tournament_match_id } : undefined;
    });
  }

  async account(accountId: string): Promise<Account | undefined> {
    await this.ensureReady();
    const row = (
      await this.pool.query<AccountRow>(
        "SELECT id,display_name,avatar_url,avatar_id,avatar_image_version,roles FROM accounts WHERE id=$1",
        [accountId],
      )
    ).rows[0];
    return row ? toAccount(row) : undefined;
  }
  async updateAvatar(accountId: string, avatarId: AvatarChoice): Promise<Account | undefined> {
    await this.ensureReady();
    const row = (
      await this.pool.query<AccountRow>(
        "UPDATE accounts SET avatar_id=$1,avatar_image=NULL,avatar_image_type=NULL,avatar_image_version=NULL WHERE id=$2 RETURNING id,display_name,avatar_url,avatar_id,avatar_image_version,roles",
        [avatarId, accountId],
      )
    ).rows[0];
    return row ? toAccount(row) : undefined;
  }

  /**
   * Stores bytes that already passed `inspectAvatarImage`. The uploaded picture wins over a preset,
   * and the version bump retires every cached URL in one step.
   */
  async setAvatarImage(accountId: string, image: { bytes: Buffer; contentType: string }): Promise<Account | undefined> {
    await this.ensureReady();
    const row = (
      await this.pool.query<AccountRow>(
        `UPDATE accounts SET avatar_image=$1,avatar_image_type=$2,
           avatar_image_version=COALESCE(avatar_image_version,0)+1,avatar_id=NULL
         WHERE id=$3
         RETURNING id,display_name,avatar_url,avatar_id,avatar_image_version,roles`,
        [image.bytes, image.contentType, accountId],
      )
    ).rows[0];
    return row ? toAccount(row) : undefined;
  }

  async clearAvatarImage(accountId: string): Promise<Account | undefined> {
    await this.ensureReady();
    const row = (
      await this.pool.query<AccountRow>(
        `UPDATE accounts SET avatar_image=NULL,avatar_image_type=NULL,avatar_image_version=NULL
         WHERE id=$1
         RETURNING id,display_name,avatar_url,avatar_id,avatar_image_version,roles`,
        [accountId],
      )
    ).rows[0];
    return row ? toAccount(row) : undefined;
  }

  /** The public bytes of an uploaded picture, for the route that serves it. */
  async avatarImage(accountId: string): Promise<{ bytes: Buffer; contentType: string; version: number } | undefined> {
    await this.ensureReady();
    const row = (
      await this.pool.query<{
        avatar_image: Buffer | null;
        avatar_image_type: string | null;
        avatar_image_version: string | null;
      }>("SELECT avatar_image,avatar_image_type,avatar_image_version FROM accounts WHERE id=$1", [accountId])
    ).rows[0];
    if (!row?.avatar_image || !row.avatar_image_type || row.avatar_image_version == null) return undefined;
    return { bytes: row.avatar_image, contentType: row.avatar_image_type, version: Number(row.avatar_image_version) };
  }

  async preferences(accountId: string): Promise<AccountPreferences> {
    await this.ensureReady();
    const result = await this.pool.query<{ preferences: AccountPreferences }>(
      "SELECT preferences FROM accounts WHERE id=$1",
      [accountId],
    );
    return result.rows[0]?.preferences ?? {};
  }

  /** Merges `changes` into the stored preferences, so a device only overwrites the keys it sends. */
  async updatePreferences(accountId: string, changes: AccountPreferences): Promise<AccountPreferences> {
    return this.transaction(async (client) => {
      const current = (
        await client.query<{ preferences: AccountPreferences }>(
          "SELECT preferences FROM accounts WHERE id=$1 FOR UPDATE",
          [accountId],
        )
      ).rows[0];
      if (!current) return {};
      const preferences = { ...current.preferences, ...changes };
      await client.query("UPDATE accounts SET preferences=$1 WHERE id=$2", [JSON.stringify(preferences), accountId]);
      return preferences;
    });
  }

  async updateDisplayName(accountId: string, input: string): Promise<Account | undefined> {
    return this.updateProfile(accountId, { displayName: input });
  }

  /** Identity changes and registration names commit together, including avatar selection. */
  async updateProfile(
    accountId: string,
    changes: { displayName: string; avatarId?: AvatarChoice },
  ): Promise<Account | undefined> {
    return this.transaction(async (client) => {
      const current = (
        await client.query<AccountRow>(
          "SELECT id,display_name,avatar_url,avatar_id,avatar_image_version,roles FROM accounts WHERE id=$1 FOR UPDATE",
          [accountId],
        )
      ).rows[0];
      if (!current) return undefined;
      const displayName =
        changes.displayName === current.display_name ? current.display_name : normalizeDisplayName(changes.displayName);
      try {
        const updated = (
          await client.query<AccountRow>(
            changes.avatarId === undefined
              ? "UPDATE accounts SET display_name=$1 WHERE id=$2 RETURNING id,display_name,avatar_url,avatar_id,avatar_image_version,roles"
              : "UPDATE accounts SET display_name=$1,avatar_id=$3 WHERE id=$2 RETURNING id,display_name,avatar_url,avatar_id,avatar_image_version,roles",
            changes.avatarId === undefined ? [displayName, accountId] : [displayName, accountId, changes.avatarId],
          )
        ).rows[0];
        await client.query(
          "UPDATE tournament_participants SET display_name=$1 WHERE account_id=$2 AND tournament_id IN (SELECT id FROM tournaments WHERE status='registration')",
          [displayName, accountId],
        );
        return updated ? toAccount(updated) : undefined;
      } catch (error) {
        if (isUniqueViolation(error)) throw new DisplayNameTakenError("display name is already taken");
        throw error;
      }
    });
  }

  async allowMagicLinkRequest({
    ip,
    email,
    now = Date.now(),
  }: {
    ip: string;
    email: string;
    now?: number;
  }): Promise<boolean> {
    await this.ensureReady();
    if (now - this.lastMagicLinkCleanup >= 60_000) {
      this.lastMagicLinkCleanup = now;
      await this.pool.query("DELETE FROM magic_links WHERE expires_at <= $1", [now]);
      await this.pool.query("DELETE FROM magic_link_request_limits WHERE window_started_at <= $1", [
        now - MAGIC_LINK_DAY_WINDOW_MS,
      ]);
    }
    const recipient = email.trim().toLowerCase();
    for (const [key, capacity, windowMs] of [
      [`ip:${ip}`, 10, MAGIC_LINK_SHORT_WINDOW_MS],
      [`email:${recipient}`, 3, MAGIC_LINK_SHORT_WINDOW_MS],
      [`ip-day:${ip}`, 20, MAGIC_LINK_DAY_WINDOW_MS],
      [`email-day:${recipient}`, 5, MAGIC_LINK_DAY_WINDOW_MS],
    ] as const) {
      const keyHash = hash(key);
      await this.pool.query(
        "INSERT INTO magic_link_request_limits (key_hash, window_started_at, attempts) VALUES ($1,$2,0) ON CONFLICT (key_hash) DO NOTHING",
        [keyHash, now],
      );
      const result = await this.pool.query(
        `UPDATE magic_link_request_limits SET
           attempts=CASE WHEN window_started_at <= $2 THEN 1 ELSE attempts+1 END,
           window_started_at=CASE WHEN window_started_at <= $2 THEN $3 ELSE window_started_at END
         WHERE key_hash=$1 AND (window_started_at <= $2 OR attempts < $4)
         RETURNING key_hash`,
        [keyHash, now - windowMs, now, capacity],
      );
      if (!result.rowCount) return false;
    }
    return true;
  }

  async createMagicLink(email: string): Promise<{ token: string; expiresAt: number }> {
    await this.ensureReady();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + 900_000;
    await this.pool.query("INSERT INTO magic_links (token_hash,email,expires_at) VALUES ($1,$2,$3)", [
      hash(token),
      email.trim().toLowerCase(),
      expiresAt,
    ]);
    return { token, expiresAt };
  }
  // The conditional UPDATE takes the row lock, so concurrent sends never push `sent` past `limit`.
  async reserveEmail(provider: string, day: string, limit: number): Promise<boolean> {
    await this.ensureReady();
    await this.pool.query(
      "INSERT INTO email_daily_usage (provider, day, sent) VALUES ($1,$2,0) ON CONFLICT (provider, day) DO NOTHING",
      [provider, day],
    );
    const result = await this.pool.query(
      "UPDATE email_daily_usage SET sent=sent+1 WHERE provider=$1 AND day=$2 AND sent<$3 RETURNING sent",
      [provider, day, limit],
    );
    return (result.rowCount ?? 0) > 0;
  }
  async exhaustEmail(provider: string, day: string, limit: number): Promise<void> {
    await this.ensureReady();
    await this.pool.query("UPDATE email_daily_usage SET sent=$3 WHERE provider=$1 AND day=$2 AND sent<$3", [
      provider,
      day,
      limit,
    ]);
  }
  async magicLinkIsLive(token: string): Promise<boolean> {
    await this.ensureReady();
    const result = await this.pool.query(
      "SELECT 1 FROM magic_links WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>$2",
      [hash(token), Date.now()],
    );
    return (result.rowCount ?? 0) > 0;
  }
  async consumeMagicLink(token: string): Promise<Account | undefined> {
    const email = await this.transaction(
      async (client) =>
        (
          await client.query<{ email: string }>(
            "UPDATE magic_links SET consumed_at=$1 WHERE token_hash=$2 AND consumed_at IS NULL AND expires_at>$1 RETURNING email",
            [Date.now(), hash(token)],
          )
        ).rows[0]?.email,
    );
    return email ? this.accountForIdentity("email", email, email.split("@")[0] ?? "Player") : undefined;
  }

  async decks(accountId: string): Promise<Deck[]> {
    await this.ensureReady();
    const result = await this.pool.query<{
      id: string;
      name: string;
      main_deck: string[];
      egg_deck: string[];
      revision: number;
      main_deck_arts: string[];
      egg_deck_arts: string[];
      cover_card_id: string | null;
      sleeve_id: string | null;
      egg_sleeve_id: string | null;
      format: import("@aegis/shared").DeckFormat;
      updated_at: string | number;
    }>(
      "SELECT id,name,main_deck,egg_deck,main_deck_arts,egg_deck_arts,cover_card_id,sleeve_id,egg_sleeve_id,format,revision,updated_at FROM saved_decks WHERE account_id=$1 ORDER BY updated_at DESC",
      [accountId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      mainDeck: row.main_deck,
      eggDeck: row.egg_deck,
      mainDeckArts: row.main_deck_arts,
      eggDeckArts: row.egg_deck_arts,
      coverCardId: row.cover_card_id ?? undefined,
      sleeveId: row.sleeve_id ?? undefined,
      eggSleeveId: row.egg_sleeve_id ?? undefined,
      format: row.format,
      revision: row.revision,
      updatedAt: Number(row.updated_at),
    }));
  }
  async saveDeck(
    accountId: string,
    input: Omit<Deck, "id" | "revision" | "updatedAt"> & { id?: string },
  ): Promise<Deck> {
    const mainDeckArts = input.mainDeck.map(
      (cardId, index) => resolveCardArt(cardId, input.mainDeckArts?.[index]).artId,
    );
    const eggDeckArts = input.eggDeck.map((cardId, index) => resolveCardArt(cardId, input.eggDeckArts?.[index]).artId);
    const coverCardId =
      input.coverCardId && [...input.mainDeck, ...input.eggDeck].includes(input.coverCardId)
        ? input.coverCardId
        : undefined;
    return this.transaction(async (client) => {
      await client.query("SELECT 1 FROM accounts WHERE id=$1 FOR UPDATE", [accountId]);
      const id = input.id ?? randomUUID();
      const current = await client.query<{ revision: number; main_deck: string[]; egg_deck: string[]; format: string }>(
        "SELECT revision,main_deck,egg_deck,format FROM saved_decks WHERE account_id=$1 AND id=$2 FOR UPDATE",
        [accountId, id],
      );
      const revision = (current.rows[0]?.revision ?? 0) + 1;
      const updatedAt = Date.now();
      if (current.rows[0])
        await client.query(
          "UPDATE saved_decks SET name=$1,main_deck=$2,egg_deck=$3,revision=$4,updated_at=$5,main_deck_arts=$8,egg_deck_arts=$9,cover_card_id=$10,sleeve_id=$11,egg_sleeve_id=$12,format=$13 WHERE account_id=$6 AND id=$7",
          [
            input.name,
            JSON.stringify(input.mainDeck),
            JSON.stringify(input.eggDeck),
            revision,
            updatedAt,
            accountId,
            id,
            JSON.stringify(mainDeckArts),
            JSON.stringify(eggDeckArts),
            coverCardId ?? null,
            input.sleeveId ?? null,
            input.eggSleeveId ?? null,
            input.format ?? "standard",
          ],
        );
      else {
        const count = await client.query<{ count: string }>(
          "SELECT COUNT(*) count FROM saved_decks WHERE account_id=$1",
          [accountId],
        );
        if (Number(count.rows[0]?.count) >= MAX_SAVED_DECKS)
          throw new DeckLimitError(`accounts may save at most ${MAX_SAVED_DECKS} decks`);
        await client.query(
          "INSERT INTO saved_decks (id,account_id,name,main_deck,egg_deck,revision,updated_at,main_deck_arts,egg_deck_arts,cover_card_id,sleeve_id,egg_sleeve_id,format) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
          [
            id,
            accountId,
            input.name,
            JSON.stringify(input.mainDeck),
            JSON.stringify(input.eggDeck),
            revision,
            updatedAt,
            JSON.stringify(mainDeckArts),
            JSON.stringify(eggDeckArts),
            coverCardId ?? null,
            input.sleeveId ?? null,
            input.eggSleeveId ?? null,
            input.format ?? "standard",
          ],
        );
      }
      const previous = current.rows[0];
      if (
        !previous ||
        buildDeckCompositionKey({
          mainDeck: previous.main_deck,
          eggDeck: previous.egg_deck,
          format: previous.format,
        }) !== buildDeckCompositionKey(input)
      ) {
        await client.query("UPDATE saved_decks SET cards_changed_at=$3 WHERE account_id=$1 AND id=$2", [
          accountId,
          id,
          updatedAt,
        ]);
      }
      return {
        id,
        name: input.name,
        mainDeck: input.mainDeck,
        eggDeck: input.eggDeck,
        mainDeckArts,
        eggDeckArts,
        coverCardId,
        sleeveId: input.sleeveId,
        eggSleeveId: input.eggSleeveId,
        format: input.format ?? "standard",
        revision,
        updatedAt,
      };
    });
  }
  async deleteDeck(accountId: string, id: string): Promise<boolean> {
    return this.transaction(async (client) => {
      const deleted = await client.query("DELETE FROM saved_decks WHERE account_id=$1 AND id=$2", [accountId, id]);
      // The owner manages a public deck from its saved deck, so a public copy cannot outlive it.
      await client.query(
        "UPDATE public_decks SET status='unpublished' WHERE account_id=$1 AND source_deck_id=$2 AND status='public'",
        [accountId, id],
      );
      return deleted.rowCount === 1;
    });
  }

  /**
   * Records one authoritative result and the stats that follow from it.
   *
   * A bot opponent is written as the human in seat 0 and a NULL seat 1, flagged `opponentKind:
   * "bot"`. Those rows are history, not competitive record: `player_stats` is deliberately left
   * untouched for them, so a bot win never lands in a ranked or tournament counter. The flag is
   * what lets a reader tell "no bot matches" apart from "bot matches excluded".
   */
  async recordMatch(
    input: {
      roomId: string;
      mode: "ranked" | "tournament";
      rankedPairId?: string;
      matchLogId?: string;
      format?: DeckFormat;
      playerAccountIds: [string, string | null];
      winnerAccountId?: string;
      outcome?: MatchOutcomeSeat;
      reason: string;
      opponentKind?: "human" | "bot";
      opponentDisplayName?: string | null;
      deckSnapshots?: [DeckSnapshot, DeckSnapshot];
    },
    queryable?: PoolClient,
  ): Promise<boolean> {
    const work = async (client: PoolClient) => {
      if ((await client.query("SELECT 1 FROM match_records WHERE room_id=$1", [input.roomId])).rowCount) return false;
      const matchId = randomUUID();
      const opponentKind = input.opponentKind ?? "human";
      const outcome = input.outcome ?? seatOutcome(input.playerAccountIds, input.winnerAccountId);
      const winnerAccountId =
        input.winnerAccountId ?? (outcome === "draw" ? null : input.playerAccountIds[outcome === "player0" ? 0 : 1]);
      const finishedAt = Date.now();
      const inserted = await client.query<{ id: string }>(
        "INSERT INTO match_records (id,room_id,mode,player0_account_id,player1_account_id,winner_account_id,reason,finished_at,opponent_kind,outcome,opponent_display_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (room_id) DO NOTHING RETURNING id",
        [
          matchId,
          input.roomId,
          input.mode,
          input.playerAccountIds[0],
          input.playerAccountIds[1],
          winnerAccountId,
          input.reason,
          finishedAt,
          opponentKind,
          outcome,
          input.opponentDisplayName ?? null,
        ],
      );
      if (!inserted.rows[0]) return false;
      const names = new Map(
        (
          await client.query<{ id: string; display_name: string }>(
            "SELECT id,display_name FROM accounts WHERE id=$1 OR id=$2",
            [input.playerAccountIds[0], input.playerAccountIds[1] ?? input.playerAccountIds[0]],
          )
        ).rows.map((row) => [row.id, row.display_name]),
      );
      for (const [seat, accountId] of input.playerAccountIds.entries()) {
        if (!accountId) continue;
        const opponentId = input.playerAccountIds[seat === 0 ? 1 : 0];
        await addToHistory(client, accountId, input.roomId, {
          id: matchId,
          opponentDeck: input.deckSnapshots?.[seat === 0 ? 1 : 0]
            ? structuredClone(input.deckSnapshots[seat === 0 ? 1 : 0])
            : undefined,
          opponentDeckOwnerAccountId: opponentId ?? undefined,
          ownDeck: input.deckSnapshots?.[seat] ? structuredClone(input.deckSnapshots[seat]) : undefined,
          ownDeckId: input.deckSnapshots?.[seat]?.deckId,
          ownDeckKey: input.deckSnapshots?.[seat] ? buildDeckCompositionKey(input.deckSnapshots[seat]!) : undefined,
          ownDeckName: input.deckSnapshots?.[seat]?.deckName,
          mode: input.mode,
          opponentName: (opponentId && names.get(opponentId)) || input.opponentDisplayName || "Bot",
          opponentKind,
          result: resultFor(
            { outcome, winner_account_id: winnerAccountId, player0_account_id: input.playerAccountIds[0] },
            accountId,
          ),
          reason: input.reason,
          finishedAt,
        });
      }
      const rated = opponentKind === "human" ? input.playerAccountIds.filter((id): id is string => id !== null) : [];
      for (const accountId of rated)
        await client.query("INSERT INTO player_stats (account_id) VALUES ($1) ON CONFLICT DO NOTHING", [accountId]);
      for (const accountId of rated) {
        const result = outcome === "draw" ? "draws" : accountId === winnerAccountId ? "wins" : "losses";
        await client.query(
          `UPDATE player_stats SET ${input.mode}_${result}=${input.mode}_${result}+1 WHERE account_id=$1`,
          [accountId],
        );
      }
      for (const [index, deck] of (input.deckSnapshots ?? []).entries()) {
        const accountId = input.playerAccountIds[index];
        if (!accountId) continue;
        const result = outcome === "draw" ? "draw" : accountId === winnerAccountId ? "win" : "loss";
        await client.query(
          "INSERT INTO match_deck_snapshots (match_id,account_id,snapshot_id,deck_id,deck_name,main_deck,egg_deck,result) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            matchId,
            accountId,
            hash(JSON.stringify([deck.mainDeck, deck.eggDeck])),
            deck.deckId,
            deck.deckName,
            JSON.stringify(deck.mainDeck),
            JSON.stringify(deck.eggDeck),
            result,
          ],
        );
      }
      if (input.rankedPairId) {
        await recordRankedResult({
          db: client,
          pairId: input.rankedPairId,
          roomId: input.roomId,
          matchId,
          matchLogId: input.matchLogId,
          winnerAccountId,
        });
      }
      if (input.format && input.deckSnapshots && opponentKind === "human" && input.playerAccountIds[1]) {
        await recordCompetitiveFacts({
          db: client,
          matchId,
          roomId: input.roomId,
          origin: input.mode,
          format: input.format,
          accountIds: [input.playerAccountIds[0], input.playerAccountIds[1]],
          decks: input.deckSnapshots,
          winnerAccountId,
          finishedAt,
        });
      }
      return true;
    };
    return queryable ? work(queryable) : this.transaction(work);
  }
  async recordRankedDodge(roomId: string, accountId: string): Promise<boolean> {
    return this.transaction(async (client) => {
      if (
        (
          await client.query("SELECT 1 FROM ranked_dodge_records WHERE room_id=$1 AND account_id=$2", [
            roomId,
            accountId,
          ])
        ).rowCount
      )
        return false;
      const inserted = await client.query<{ room_id: string }>(
        "INSERT INTO ranked_dodge_records (room_id,account_id,created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING room_id",
        [roomId, accountId, Date.now()],
      );
      if (!inserted.rows[0]) return false;
      await client.query(
        "INSERT INTO player_stats (account_id,ranked_dodges) VALUES ($1,1) ON CONFLICT (account_id) DO UPDATE SET ranked_dodges=player_stats.ranked_dodges+1",
        [accountId],
      );
      return true;
    });
  }

  /**
   * The room's view of a finished game. It names the replay recording, so it replaces the entry
   * `recordMatch` may have written for the same room first; a second report from the room changes nothing.
   */
  async recordRecentMatch(accountId: string, roomId: string, record: StoredMatchRecord): Promise<void> {
    await this.transaction(async (client) => {
      const owner = await client.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [accountId]);
      if (!owner.rowCount) return;
      await addToHistory(client, accountId, roomId, record);
      await client.query(
        "UPDATE account_recent_matches SET match_id=$3,finished_at=$4,record=$5 WHERE account_id=$1 AND room_id=$2 AND match_id IN (SELECT id::text FROM match_records WHERE room_id=$2)",
        [accountId, roomId, record.id, record.finishedAt, JSON.stringify(record)],
      );
    });
  }

  /** One numbered page of the kept history, newest first, and how many matches the filter selects. */
  async matchHistory(
    accountId: string,
    { page, limit, ...filter }: { page: number; limit: number } & MatchHistoryFilter,
  ): Promise<{
    matches: Array<MatchRecord & { hasOpponentDeck: boolean; hasOwnDeck: boolean }>;
    total: number;
    winRate: MatchWinRate;
    decks: Array<{ id: string; name: string }>;
    deckDetails?: DeckHistoryDetails;
    deckRecords?: DeckPerformanceRecord[];
    recentDeckResults?: Array<MatchHistoryRecord["result"]>;
    deckStats?: { total: MatchWinRate; sinceChange: MatchWinRate | null };
  }> {
    await this.ensureReady();
    const params: unknown[] = [accountId];
    const conditions = ["account_id=$1"];

    if (filter.deckId) {
      conditions.push(`record->>'ownDeckId'=$${params.push(filter.deckId)}`);
    }
    if (filter.mode) conditions.push(`record->>'mode'=$${params.push(filter.mode)}`);
    // A backslash is Postgres's default LIKE escape, so the player's text matches literally.
    if (filter.opponent)
      conditions.push(
        `record->>'opponentName' ILIKE $${params.push(`%${filter.opponent.replace(/[\\%_]/g, "\\$&")}%`)}`,
      );
    // Count the full retained human history before applying the result filter or pagination.
    // Exclude both bot markers, including inconsistent legacy records.
    const rate = (
      await this.pool.query<MatchWinRate>(
        `SELECT count(*)::int matches,
        COALESCE(SUM(CASE WHEN record->>'result'='win' THEN 1 ELSE 0 END),0)::int wins,
        COALESCE(SUM(CASE WHEN record->>'result'='loss' THEN 1 ELSE 0 END),0)::int losses,
        COALESCE(SUM(CASE WHEN record->>'result'='draw' THEN 1 ELSE 0 END),0)::int draws
        FROM account_recent_matches WHERE ${conditions.join(" AND ")}
        AND record->>'opponentKind'='human' AND record->>'mode'<>'bot'`,
        params,
      )
    ).rows[0];
    const winRate: MatchWinRate = {
      matches: Number(rate?.matches ?? 0),
      wins: Number(rate?.wins ?? 0),
      losses: Number(rate?.losses ?? 0),
      draws: Number(rate?.draws ?? 0),
    };
    const savedDecks = await this.decks(accountId);
    const knownDecks = await this.pool.query<{ deck_id: string; deck_name: string }>(
      "SELECT DISTINCT ON (deck_id) deck_id,deck_name FROM account_deck_matches WHERE account_id=$1 ORDER BY deck_id,(record->>'ownDeckStartedAt')::bigint DESC NULLS LAST",
      [accountId],
    );
    const decksById = new Map(savedDecks.map((deck) => [deck.id, { id: deck.id, name: deck.name }]));
    for (const row of knownDecks.rows) {
      if (!decksById.has(row.deck_id)) {
        decksById.set(row.deck_id, { id: row.deck_id, name: row.deck_name });
      }
    }
    let deckStats: { total: MatchWinRate; sinceChange: MatchWinRate | null } | undefined;
    let deckDetails: DeckHistoryDetails | undefined;
    let recentDeckResults: Array<MatchHistoryRecord["result"]> | undefined;
    if (filter.deckId) {
      const deck = savedDecks.find((item) => item.id === filter.deckId);
      let sinceChange: MatchWinRate | null = null;
      if (deck) {
        const changed = await this.pool.query<{ cards_changed_at: string | number }>(
          "SELECT cards_changed_at FROM saved_decks WHERE account_id=$1 AND id=$2",
          [accountId, deck.id],
        );
        deckDetails = {
          deck: {
            deckId: deck.id,
            deckName: deck.name,
            mainDeck: deck.mainDeck,
            eggDeck: deck.eggDeck,
            mainDeckArts: deck.mainDeckArts,
            eggDeckArts: deck.eggDeckArts,
            format: deck.format,
          },
          coverCardId: deck.coverCardId,
          cardsChangedAt: Number(changed.rows[0]?.cards_changed_at ?? 0),
        };
        sinceChange = await getDeckMatchWinRate({
          db: this.pool,
          accountId,
          filter,
          compositionSignature: buildDeckCompositionSignature({ compositionKey: buildDeckCompositionKey(deck) }),
          changedAt: Number(changed.rows[0]?.cards_changed_at ?? 0),
        });
      }
      deckStats = {
        total: await getDeckMatchWinRate({
          db: this.pool,
          accountId,
          filter,
          matchLimit: getDeckStatsMatchLimit(filter.deckWindow),
        }),
        sinceChange,
      };
      recentDeckResults = await getDeckRecentResults({ db: this.pool, accountId, filter });
    }
    if (filter.result) conditions.push(`record->>'result'=$${params.push(filter.result)}`);
    const where = `FROM account_recent_matches WHERE ${conditions.join(" AND ")}`;
    const total = await this.pool.query<{ total: number }>(`SELECT count(*)::int total ${where}`, params);
    const rows = await this.pool.query<{ record: StoredMatchRecord }>(
      `SELECT record ${where} ORDER BY finished_at DESC, room_id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit],
    );
    return {
      matches: await Promise.all(
        rows.rows.map(async ({ record }) => ({
          ...removeBotExperiment(record),
          hasOwnDeck: getStoredMatchOwnDeck({ record }) !== undefined,
          hasOpponentDeck:
            record.opponentDeck !== undefined &&
            (record.opponentDeckOwnerAccountId === undefined ||
              (await this.preferences(record.opponentDeckOwnerAccountId)).shareDeckAfterMatch !== false),
        })),
      ),
      total: Number(total.rows[0]?.total ?? 0),
      winRate,
      decks: [...decksById.values()],
      deckRecords: filter.deckId
        ? undefined
        : await getDeckPerformanceRecords({
            db: this.pool,
            accountId,
            filter,
            decks: [...decksById.values()],
            matchLimit: getDeckStatsMatchLimit(filter.deckWindow),
          }),
      deckDetails,
      recentDeckResults,
      deckStats,
    };
  }

  async getMatchOwnDeck({ accountId, matchId }: MatchDeckParams): Promise<UsedDeck | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<{ record: StoredMatchRecord }>(
      "SELECT record FROM account_recent_matches WHERE account_id=$1 AND match_id=$2",
      [accountId, matchId],
    );
    const record = result.rows[0]?.record;
    return record ? getStoredMatchOwnDeck({ record }) : undefined;
  }

  async getMatchOpponentDeck({ accountId, matchId }: MatchDeckParams): Promise<UsedDeck | undefined> {
    await this.ensureReady();
    const result = await this.pool.query<{ record: StoredMatchRecord }>(
      "SELECT record FROM account_recent_matches WHERE account_id=$1 AND match_id=$2",
      [accountId, matchId],
    );
    const record = result.rows[0]?.record;
    if (record?.opponentDeck === undefined) {
      return undefined;
    }
    if (
      record.opponentDeckOwnerAccountId !== undefined &&
      (await this.preferences(record.opponentDeckOwnerAccountId)).shareDeckAfterMatch === false
    ) {
      return undefined;
    }
    return structuredClone({ ...record.opponentDeck, deckId: null });
  }

  async matchSummary(accountId: string): Promise<MatchHistorySummary> {
    await this.ensureReady();
    const counts = (
      await this.pool.query<{ matches: number; wins: number; losses: number; draws: number }>(
        `SELECT count(*)::int matches,
           COALESCE(SUM(CASE WHEN record->>'result'='win' THEN 1 ELSE 0 END),0)::int wins,
           COALESCE(SUM(CASE WHEN record->>'result'='loss' THEN 1 ELSE 0 END),0)::int losses,
           COALESCE(SUM(CASE WHEN record->>'result'='draw' THEN 1 ELSE 0 END),0)::int draws
         FROM account_recent_matches WHERE account_id=$1`,
        [accountId],
      )
    ).rows[0];
    const saved = await this.pool.query<{ total: number }>(
      "SELECT count(*)::int total FROM account_replays WHERE account_id=$1 AND saved_at IS NOT NULL",
      [accountId],
    );
    return {
      matches: Number(counts?.matches ?? 0),
      wins: Number(counts?.wins ?? 0),
      losses: Number(counts?.losses ?? 0),
      draws: Number(counts?.draws ?? 0),
      replaysSaved: Number(saved.rows[0]?.total ?? 0),
    };
  }

  async profile(accountId: string): Promise<{ stats: PlayerStats; summary: MatchHistorySummary; decks: DeckStat[] }> {
    await this.ensureReady();
    const statsResult = await this.pool.query<Record<string, string | number>>(
      "SELECT * FROM player_stats WHERE account_id=$1",
      [accountId],
    );
    const r = statsResult.rows[0];
    const stats: PlayerStats = {
      rankedWins: Number(r?.ranked_wins ?? 0),
      rankedLosses: Number(r?.ranked_losses ?? 0),
      rankedDraws: Number(r?.ranked_draws ?? 0),
      rankedDodges: Number(r?.ranked_dodges ?? 0),
      tournamentWins: Number(r?.tournament_wins ?? 0),
      tournamentLosses: Number(r?.tournament_losses ?? 0),
      tournamentDraws: Number(r?.tournament_draws ?? 0),
      tournamentsPlayed: Number(r?.tournaments_played ?? 0),
      tournamentsWon: Number(r?.tournaments_won ?? 0),
    };
    const snapshotResult = await this.pool.query<{
      snapshot_id: string;
      deck_id: string | null;
      deck_name: string;
      main_deck: string[];
      egg_deck: string[];
      result: "win" | "loss" | "draw";
    }>("SELECT snapshot_id,deck_id,deck_name,main_deck,egg_deck,result FROM match_deck_snapshots WHERE account_id=$1", [
      accountId,
    ]);
    const deckMap = new Map<string, DeckStat>();
    for (const row of snapshotResult.rows) {
      const stat = deckMap.get(row.snapshot_id) ?? {
        snapshotId: row.snapshot_id,
        deckId: row.deck_id,
        deckName: row.deck_name,
        mainDeck: row.main_deck,
        eggDeck: row.egg_deck,
        wins: 0,
        losses: 0,
        draws: 0,
        matches: 0,
      };
      stat.matches++;
      if (row.result === "win") stat.wins++;
      else if (row.result === "loss") stat.losses++;
      else stat.draws++;
      deckMap.set(row.snapshot_id, stat);
    }
    const decks = [...deckMap.values()].sort((a, b) => b.matches - a.matches || a.deckName.localeCompare(b.deckName));
    return {
      stats,
      summary: await this.matchSummary(accountId),
      decks,
    };
  }

  // topCutSize stays NULL here on purpose: the official cut is computed from the confirmed field
  // when check-in closes, not from maxPlayers at creation.
  async createTournament(createdBy: string, record: CreateTournamentRecord): Promise<Tournament> {
    await this.ensureReady();
    const input = { ...LEGACY_TOURNAMENT_PROGRAM, ...record };
    const id = record.id ?? randomUUID();
    await this.pool.query(
      "INSERT INTO tournaments (id,name,block,status,starts_at,max_players,created_by,created_at,structure,best_of,top_cut_enabled,allow_bots,rules_snapshot,banlist_policy,banlist_cards,description,password_hash,format,category,random_bot_styles,circuit_id,auto_start,registration_closes_at,check_in_opens_at,check_in_closes_at,round_start_mode) VALUES ($1,$2,$3,'registration',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) ON CONFLICT DO NOTHING",
      [
        id,
        input.name,
        input.block,
        input.startsAt,
        input.maxPlayers,
        createdBy,
        Date.now(),
        input.structure,
        input.bestOf,
        input.topCutEnabled,
        input.allowBots,
        JSON.stringify(input.rules),
        JSON.stringify(input.banlistPolicy),
        JSON.stringify(input.banlistCards),
        input.description ?? "",
        input.passwordHash ?? null,
        input.format ?? "standard",
        input.category ?? TournamentCategory.COMMUNITY.value,
        input.allowBots && input.randomBotStyles,
        input.circuitId ?? null,
        input.autoStart === true,
        input.registrationClosesAt ?? null,
        input.checkInOpensAt ?? null,
        input.checkInClosesAt ?? null,
        input.roundStartMode ?? TournamentRoundStartMode.AUTOMATIC.value,
      ],
    );
    return (await this.tournament(id))!;
  }
  async tournaments(): Promise<Tournament[]> {
    await this.ensureReady();
    const result = await this.pool.query<TournamentRow>(`SELECT * FROM tournaments
        ORDER BY CASE WHEN status IN ('finished','cancelled') THEN 1 ELSE 0 END,
        CASE WHEN status IN ('finished','cancelled') THEN -starts_at ELSE starts_at END ASC`);
    return Promise.all(
      result.rows.map(async (row) =>
        toTournament({
          ...row,
          registrations:
            (
              await this.pool.query<{ count: string }>(
                `SELECT COUNT(*) count FROM (
                  SELECT COALESCE(account_id,id) AS entrant FROM tournament_participants
                  WHERE tournament_id=$1 AND status IN ('registered','checked_in','active')
                  UNION
                  SELECT account_id AS entrant FROM tournament_registrations
                  WHERE tournament_id=$1 AND account_id NOT IN (
                    SELECT account_id FROM tournament_participants WHERE tournament_id=$1 AND account_id IS NOT NULL
                  )
                ) entrants`,
                [row.id],
              )
            ).rows[0]?.count ?? 0,
        }),
      ),
    );
  }
  async hasOpenTournamentCreatedBy(accountId: string): Promise<boolean> {
    await this.ensureReady();
    const found = await this.pool.query(
      "SELECT 1 FROM tournaments WHERE created_by=$1 AND status NOT IN ('finished','cancelled') LIMIT 1",
      [accountId],
    );
    return (found.rowCount ?? 0) > 0;
  }

  async tournament(id: string): Promise<Tournament | undefined> {
    await this.ensureReady();
    const row = (await this.pool.query<TournamentRow>("SELECT * FROM tournaments WHERE id=$1", [id])).rows[0];
    if (!row) return undefined;
    const registrations =
      (
        await this.pool.query<{ count: string }>(
          `SELECT COUNT(*) count FROM (
                  SELECT COALESCE(account_id,id) AS entrant FROM tournament_participants
                  WHERE tournament_id=$1 AND status IN ('registered','checked_in','active')
                  UNION
                  SELECT account_id AS entrant FROM tournament_registrations
                  WHERE tournament_id=$1 AND account_id NOT IN (
                    SELECT account_id FROM tournament_participants WHERE tournament_id=$1 AND account_id IS NOT NULL
                  )
                ) entrants`,
          [id],
        )
      ).rows[0]?.count ?? 0;
    return toTournament({ ...row, registrations });
  }
  async registerTournament(id: string, accountId: string): Promise<boolean> {
    return this.transaction(async (client) => {
      const t = (
        await client.query<{ status: string; max_players: number; password_hash: string | null }>(
          "SELECT status,max_players,password_hash FROM tournaments WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!t || t.status !== "registration" || t.password_hash) return false;
      const registrations = await client.query<{ count: string }>(
        "SELECT COUNT(*) count FROM tournament_registrations WHERE tournament_id=$1",
        [id],
      );
      if (Number(registrations.rows[0]?.count) >= t.max_players) return false;
      return (
        (
          await client.query(
            "INSERT INTO tournament_registrations (tournament_id,account_id,created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
            [id, accountId, Date.now()],
          )
        ).rowCount === 1
      );
    });
  }
  // Hard delete, allowed only to the creator and only before the event starts: once it is running
  // or finished the tournament is a record other players appear in, not a draft. Children go first,
  // deepest FK first, so a stray row in any child table cannot leave the transaction half-applied.
  async setTournamentCategory(id: string, category: TournamentCategory): Promise<boolean> {
    await this.ensureReady();
    const result = await this.pool.query("UPDATE tournaments SET category=$2 WHERE id=$1", [id, category]);
    return result.rowCount === 1;
  }
  async setTournamentDiscordAnnounce(id: string, announce: boolean): Promise<boolean> {
    await this.ensureReady();
    const result = await this.pool.query("UPDATE tournaments SET discord_announce=$2 WHERE id=$1", [id, announce]);
    return result.rowCount === 1;
  }
  async deleteTournament(
    id: string,
    organizerId: string,
    canDeleteAny = false,
  ): Promise<"deleted" | "not_found" | "forbidden" | "already_started"> {
    return this.transaction(async (client) => {
      const t = (
        await client.query<{ created_by: string; status: string }>(
          "SELECT created_by,status FROM tournaments WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!t) return "not_found";
      if (!canDeleteAny && t.created_by !== organizerId) return "forbidden";
      if (!isTournamentDeletable(t.status)) return "already_started";
      await client.query(
        "DELETE FROM tournament_game_authorizations WHERE game_id IN (SELECT g.id FROM tournament_games g JOIN match_series s ON s.id=g.series_id JOIN tournament_matches m ON m.id=s.tournament_match_id WHERE m.tournament_id=$1)",
        [id],
      );
      await client.query(
        "DELETE FROM tournament_games WHERE series_id IN (SELECT s.id FROM match_series s JOIN tournament_matches m ON m.id=s.tournament_match_id WHERE m.tournament_id=$1)",
        [id],
      );
      await client.query(
        "DELETE FROM match_series WHERE tournament_match_id IN (SELECT id FROM tournament_matches WHERE tournament_id=$1)",
        [id],
      );
      await client.query("DELETE FROM tournament_standings_snapshots WHERE tournament_id=$1", [id]);
      await client.query("DELETE FROM tournament_result_ledger WHERE tournament_id=$1", [id]);
      await client.query("DELETE FROM tournament_matches WHERE tournament_id=$1", [id]);
      await client.query(
        "DELETE FROM tournament_rounds WHERE phase_id IN (SELECT id FROM tournament_phases WHERE tournament_id=$1)",
        [id],
      );
      await client.query("DELETE FROM tournament_phases WHERE tournament_id=$1", [id]);
      await client.query("DELETE FROM tournament_deadlines WHERE tournament_id=$1", [id]);
      await client.query("DELETE FROM tournament_events WHERE tournament_id=$1", [id]);
      await client.query("DELETE FROM tournament_event_sequences WHERE tournament_id=$1", [id]);
      await client.query("DELETE FROM tournament_participants WHERE tournament_id=$1", [id]);
      await client.query("DELETE FROM tournament_registrations WHERE tournament_id=$1", [id]);
      await client.query("DELETE FROM tournament_discord_rounds WHERE tournament_id=$1", [id]);
      await client.query("DELETE FROM tournament_discord_placements WHERE tournament_id=$1", [id]);
      await client.query("DELETE FROM tournament_discord_posts WHERE tournament_id=$1", [id]);
      await client.query("DELETE FROM tournament_spectators WHERE tournament_id=$1", [id]);
      await client.query("DELETE FROM tournaments WHERE id=$1", [id]);
      return "deleted";
    });
  }
  async startTournament(id: string, organizerId: string): Promise<boolean> {
    return this.transaction(async (client) => {
      const t = (
        await client.query<{ created_by: string; status: string }>(
          "SELECT created_by,status FROM tournaments WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      const players = (
        await client.query<{ account_id: string }>(
          "SELECT account_id FROM tournament_registrations WHERE tournament_id=$1 ORDER BY created_at,account_id",
          [id],
        )
      ).rows;
      if (!t || t.created_by !== organizerId || t.status !== "registration" || players.length < 2) return false;
      const size = 2 ** Math.ceil(Math.log2(players.length));
      const rounds = Math.log2(size);
      for (let round = 1; round <= rounds; round++)
        for (let position = 0; position < size / 2 ** round; position++)
          await client.query(
            "INSERT INTO tournament_matches (id,tournament_id,round,position,status) VALUES ($1,$2,$3,$4,'waiting')",
            [randomUUID(), id, round, position],
          );
      for (let position = 0; position < size / 2; position++) {
        const p0 = players[position]?.account_id ?? null,
          p1 = players[size - 1 - position]?.account_id ?? null;
        await client.query(
          "UPDATE tournament_matches SET player0_account_id=$1,player1_account_id=$2,status=$3 WHERE tournament_id=$4 AND round=1 AND position=$5",
          [p0, p1, p0 && p1 ? "pending" : "bye", id, position],
        );
      }
      await client.query("UPDATE tournaments SET status='in_progress' WHERE id=$1", [id]);
      for (const p of players)
        await client.query(
          "INSERT INTO player_stats (account_id,tournaments_played) VALUES ($1,1) ON CONFLICT (account_id) DO UPDATE SET tournaments_played=player_stats.tournaments_played+1",
          [p.account_id],
        );
      const byes = (await this.tournamentMatches(id, client)).filter((m) => m.status === "bye");
      for (const match of byes)
        await this.advanceTournamentWinner(id, match, match.player0AccountId ?? match.player1AccountId!, client);
      return true;
    });
  }
  async tournamentMatches(id: string, q: Queryable = this.pool): Promise<TournamentMatch[]> {
    await this.ensureReady();
    const result = await q.query<Record<string, string | number | null>>(
      "SELECT id,round,position,player0_account_id,player1_account_id,winner_account_id,status FROM tournament_matches WHERE tournament_id=$1 ORDER BY round,position",
      [id],
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      round: Number(row.round),
      position: Number(row.position),
      player0AccountId: row.player0_account_id ? String(row.player0_account_id) : null,
      player1AccountId: row.player1_account_id ? String(row.player1_account_id) : null,
      winnerAccountId: row.winner_account_id ? String(row.winner_account_id) : null,
      status: String(row.status) as TournamentMatch["status"],
    }));
  }
  async claimTournamentRoom(matchId: string, roomId: string): Promise<boolean> {
    await this.ensureReady();
    return (
      (
        await this.pool.query(
          "UPDATE tournament_matches SET room_id=$1 WHERE id=$2 AND status='pending' AND (room_id IS NULL OR room_id=$1) AND tournament_id NOT IN (SELECT tournament_id FROM tournament_phases) AND tournament_id IN (SELECT id FROM tournaments WHERE status NOT IN ('finished','cancelled'))",
          [roomId, matchId],
        )
      ).rowCount === 1
    );
  }
  async releaseTournamentRoom(matchId: string, roomId: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query(
      "UPDATE tournament_matches SET room_id=NULL WHERE id=$1 AND room_id=$2 AND status='pending'",
      [matchId, roomId],
    );
  }
  private async canRecordLegacyTournamentMatch({ client, matchId }: LegacyMatchParams): Promise<boolean> {
    const row = (
      await client.query<{ status: string }>(
        "SELECT status FROM tournaments WHERE id IN (SELECT tournament_id FROM tournament_matches WHERE id=$1) AND id NOT IN (SELECT tournament_id FROM tournament_phases) FOR UPDATE",
        [matchId],
      )
    ).rows[0];
    return row !== undefined && row.status !== "cancelled" && row.status !== "finished";
  }

  async recordTournamentRoomDraw(
    matchId: string,
    roomId: string,
    ids: [string, string],
    reason: string,
    decks?: [DeckSnapshot, DeckSnapshot],
  ): Promise<boolean> {
    return this.transaction(async (client) => {
      if (!(await this.canRecordLegacyTournamentMatch({ client, matchId }))) {
        return false;
      }
      const valid =
        (
          await client.query(
            "SELECT 1 FROM tournament_matches WHERE id=$1 AND room_id=$2 AND status='pending' AND ((player0_account_id=$3 AND player1_account_id=$4) OR (player0_account_id=$4 AND player1_account_id=$3)) FOR UPDATE",
            [matchId, roomId, ...ids],
          )
        ).rowCount === 1;
      if (!valid) return false;
      const recorded = await this.recordMatch(
        { roomId, mode: "tournament", playerAccountIds: ids, reason, deckSnapshots: decks },
        client,
      );
      if (recorded) await client.query("UPDATE tournament_matches SET room_id=NULL WHERE id=$1", [matchId]);
      return recorded;
    });
  }
  async recordTournamentRoomResult(
    matchId: string,
    roomId: string,
    ids: [string, string],
    winner: string | undefined,
    reason: string,
    decks?: [DeckSnapshot, DeckSnapshot],
  ): Promise<boolean> {
    if (!winner) return false;
    return this.transaction(async (client) => {
      if (!(await this.canRecordLegacyTournamentMatch({ client, matchId }))) {
        return false;
      }
      const row = (
        await client.query<{ tournament_id: string }>(
          "SELECT tournament_id FROM tournament_matches WHERE id=$1 AND room_id=$2 AND status='pending' AND ((player0_account_id=$3 AND player1_account_id=$4) OR (player0_account_id=$4 AND player1_account_id=$3)) FOR UPDATE",
          [matchId, roomId, ...ids],
        )
      ).rows[0];
      if (!row) return false;
      const match = (await this.tournamentMatches(row.tournament_id, client)).find((m) => m.id === matchId)!;
      if (
        !(await this.recordMatch(
          { roomId, mode: "tournament", playerAccountIds: ids, winnerAccountId: winner, reason, deckSnapshots: decks },
          client,
        ))
      )
        return false;
      await client.query("UPDATE tournament_matches SET winner_account_id=$1,status='finished' WHERE id=$2", [
        winner,
        matchId,
      ]);
      await this.advanceTournamentWinner(row.tournament_id, match, winner, client);
      return true;
    });
  }
  private async advanceTournamentWinner(
    tournamentId: string,
    match: TournamentMatch,
    winner: string,
    client: PoolClient,
  ): Promise<void> {
    const next = (
      await client.query<{ id: string }>(
        "SELECT id FROM tournament_matches WHERE tournament_id=$1 AND round=$2 AND position=$3",
        [tournamentId, match.round + 1, Math.floor(match.position / 2)],
      )
    ).rows[0];
    if (!next) {
      await client.query("UPDATE tournaments SET status='finished',winner_account_id=$1 WHERE id=$2", [
        winner,
        tournamentId,
      ]);
      await client.query("UPDATE player_stats SET tournaments_won=tournaments_won+1 WHERE account_id=$1", [winner]);
      await grantTournamentTrophies({ db: client, tournamentId, standings: async () => [], now: Date.now() });
      return;
    }
    const column = match.position % 2 === 0 ? "player0_account_id" : "player1_account_id";
    await client.query(`UPDATE tournament_matches SET ${column}=$1 WHERE id=$2`, [winner, next.id]);
    await client.query(
      "UPDATE tournament_matches SET status='pending' WHERE id=$1 AND player0_account_id IS NOT NULL AND player1_account_id IS NOT NULL",
      [next.id],
    );
  }
  private async uniqueName(q: Queryable, name: string): Promise<string> {
    const base = name.trim().slice(0, 32) || "Player";
    let candidate = base,
      suffix = 2;
    while ((await q.query("SELECT 1 FROM accounts WHERE lower(display_name)=lower($1)", [candidate])).rowCount) {
      const tail = `-${suffix++}`;
      candidate = `${base.slice(0, 32 - tail.length)}${tail}`;
    }
    return candidate;
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
/** The seat outcome a caller that only named a winning ACCOUNT meant. Both seats are people there. */
function seatOutcome(playerAccountIds: [string, string | null], winnerAccountId: string | undefined): MatchOutcomeSeat {
  if (!winnerAccountId) return "draw";
  return winnerAccountId === playerAccountIds[0] ? "player0" : "player1";
}
/**
 * What one match meant for one account. `outcome` is authoritative where it exists; rows written
 * before it did fall back to the old winner-account comparison, which was correct for them because
 * every one of them had two human seats.
 */
function resultFor(
  row: { outcome: MatchOutcomeSeat | null; winner_account_id: string | null; player0_account_id: string },
  accountId: string,
): "win" | "loss" | "draw" {
  if (row.outcome === null)
    return row.winner_account_id === null ? "draw" : row.winner_account_id === accountId ? "win" : "loss";
  if (row.outcome === "draw") return "draw";
  const seat = row.player0_account_id === accountId ? "player0" : "player1";
  return row.outcome === seat ? "win" : "loss";
}
function removeBotExperiment({
  ownDeck: _ownDeck,
  ownDeckId: _ownDeckId,
  ownDeckName,
  ownDeckKey: _ownDeckKey,
  ownDeckStartedAt: _ownDeckStartedAt,
  opponentAccountId,
  opponentDeck: _opponentDeck,
  opponentDeckOwnerAccountId: _opponentDeckOwnerAccountId,
  botExperiment: _botExperiment,
  botArm: _botArm,
  botArmFallback: _botArmFallback,
  ...record
}: StoredMatchRecord): MatchRecord {
  return { ...record, ...(ownDeckName ? { deckName: ownDeckName } : {}), canAddOpponent: Boolean(opponentAccountId) };
}
async function removeExpiredRoomTickets(db: Queryable, expiredBefore: number): Promise<void> {
  for (;;) {
    const result = await db.query(
      "DELETE FROM room_tickets WHERE token_hash IN (SELECT token_hash FROM room_tickets WHERE expires_at < $1 LIMIT $2)",
      [expiredBefore, ROOM_TICKET_CLEANUP_BATCH],
    );
    if ((result.rowCount ?? 0) < ROOM_TICKET_CLEANUP_BATCH) return;
  }
}
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505"
  );
}
/** Adds a match unless the room already has one, then keeps the newest `MATCH_HISTORY_LIMIT` and every saved replay. */
async function addToHistory(
  client: PoolClient,
  accountId: string,
  roomId: string,
  record: StoredMatchRecord,
): Promise<void> {
  if (record.ownDeckId) {
    const deckRecord = {
      finishedAt: record.finishedAt,
      mode: record.mode,
      opponentKind: record.opponentKind,
      opponentName: record.opponentName,
      result: record.result,
      ownDeckSignature: record.ownDeckKey
        ? buildDeckCompositionSignature({ compositionKey: record.ownDeckKey })
        : undefined,
      opponentDeckSignature: record.opponentDeck
        ? buildDeckCompositionSignature({ compositionKey: buildDeckCompositionKey(record.opponentDeck) })
        : undefined,
      opponentDeckName: record.opponentDeck?.deckName,
      opponentFeaturedCardId: record.opponentDeck ? getDeckFeaturedCardId(record.opponentDeck) : undefined,
      opponentDeckOwnerAccountId: record.opponentDeckOwnerAccountId,
      ownDeckStartedAt: record.ownDeckStartedAt,
    };
    await client.query(
      "INSERT INTO account_deck_matches (account_id,room_id,deck_id,deck_name,record) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (account_id,room_id) DO UPDATE SET deck_id=EXCLUDED.deck_id,deck_name=EXCLUDED.deck_name,record=EXCLUDED.record WHERE account_deck_matches.record->>'ownDeckStartedAt' IS NULL",
      [accountId, roomId, record.ownDeckId, record.ownDeckName ?? record.ownDeckId, JSON.stringify(deckRecord)],
    );
  }
  await client.query(
    "INSERT INTO account_recent_matches (account_id,room_id,match_id,finished_at,record) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (account_id,room_id) DO NOTHING",
    [accountId, roomId, record.id, record.finishedAt, JSON.stringify(record)],
  );
  await client.query(
    `DELETE FROM account_recent_matches WHERE account_id=$1
       AND room_id IN (SELECT room_id FROM account_recent_matches WHERE account_id=$1 ORDER BY finished_at DESC,room_id DESC OFFSET $2)
       AND match_id NOT IN (SELECT match_id FROM account_replays WHERE account_id=$1 AND saved_at IS NOT NULL)`,
    [accountId, MATCH_HISTORY_LIMIT],
  );
}
/** Choosing initials hides a linked Discord picture from every reader, so the url never leaves the store. */
function toAccount(row: AccountRow): Account {
  const avatarId = isDigimonWorldAvatarId(row.avatar_id) ? row.avatar_id : null;
  const avatarImageVersion = row.avatar_image_version == null ? null : Number(row.avatar_image_version);
  // The version in the URL is what makes an immutable cache safe: a new upload yields a new URL.
  const uploadedUrl = avatarImageVersion === null ? null : `/account/avatar/${row.id}/image?v=${avatarImageVersion}`;
  const avatarUrl = uploadedUrl ?? (row.avatar_id === INITIALS_AVATAR ? null : row.avatar_url);
  const roles = row.roles.filter(isAccountRole);
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl,
    avatarId,
    avatarSource: uploadedUrl ? "upload" : avatarId ? "digimon" : avatarUrl ? "discord" : "initials",
    avatarImageVersion,
    roles,
    isAdmin: hasAccountCapability({ roles, capability: "canAdminister" }),
  };
}
function normalizeDisplayName(input: string): string {
  const value = input.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (value.length < 3 || value.length > 32 || !/[\p{L}\p{N}]/u.test(value) || !/^[\p{L}\p{N}_ -]+$/u.test(value))
    throw new InvalidDisplayNameError("invalid display name");
  return value;
}
type TournamentRow = Record<string, unknown>;
function toTournament(row: TournamentRow): Tournament {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    passwordProtected: Boolean(row.password_hash),
    discordAnnounce: row.discord_announce === true,
    spectatorPolicy: isTournamentSpectatorPolicy(row.spectator_policy)
      ? row.spectator_policy
      : TournamentSpectatorPolicy.NOBODY.value,
    category: (row.category ?? TournamentCategory.COMMUNITY.value) as TournamentCategory,
    format: (row.format ?? "standard") as DeckFormat,
    block: String(row.block),
    status: String(row.status) as Tournament["status"],
    startsAt: Number(row.starts_at),
    maxPlayers: Number(row.max_players),
    createdBy: String(row.created_by),
    winnerAccountId: row.winner_account_id == null ? null : String(row.winner_account_id),
    registrations: Number(row.registrations),
    circuitId: row.circuit_id == null ? null : String(row.circuit_id),
    autoStart: row.auto_start === true,
    roundStartMode: (row.round_start_mode ?? TournamentRoundStartMode.AUTOMATIC.value) as TournamentRoundStartMode,
    ...toTournamentProgram(row),
  };
}
// Defaults here mirror the migration backfills rather than inventing a second source of truth: a row
// that predates a column reads back as what that backfill would have written.
function toTournamentProgram(row: TournamentRow): TournamentProgram {
  return {
    structure: (row.structure == null ? "single_elimination" : String(row.structure)) as TournamentStructure,
    bestOf: Number(row.best_of ?? 1) === 3 ? 3 : 1,
    topCutEnabled: row.top_cut_enabled === true,
    topCutSize: row.top_cut_size == null ? null : Number(row.top_cut_size),
    allowBots: row.allow_bots === true,
    randomBotStyles: row.random_bot_styles === true,
    rules: parseJson<TournamentRules>(row.rules_snapshot) ?? null,
    banlistPolicy: parseJson<BanlistPolicy>(row.banlist_policy) ?? { mode: "none" },
    banlistCards: parseJson<TournamentBanlistCard[]>(row.banlist_cards) ?? [],
  };
}
// pg returns jsonb already parsed, but a driver or fake that hands back the raw text must not turn
// a frozen snapshot into a string silently.
function parseJson<T>(value: unknown): T | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}
