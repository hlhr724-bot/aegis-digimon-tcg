import { FriendReplayStore } from "#api/replays/FriendReplayStore";
import { ReplayVisibility } from "@aegis/shared/replays/ReplayVisibility";
import { isDeckFormat, type DeckFormat } from "@aegis/shared/deckFormat";
import {
  MAX_PUBLIC_REPLAY_PAGE_SIZE,
  PUBLIC_REPLAY_PAGE_SIZE,
  type PublicReplay,
  type PublicReplayPage,
} from "@aegis/shared/replays/PublicReplay";
import { randomUUID } from "node:crypto";
import {
  MAX_REPLAY_BYTES,
  MAX_REPLAY_PAGE_SIZE,
  REPLAY_PAGE_SIZE,
  type ReplayDownloadMessage,
  type ReplayLibraryPage,
  type SavedReplay,
  type SharedReplay,
} from "@aegis/shared";
import type { AccountStore } from "../accounts/AccountStore.js";

type IndexRow = {
  id: string;
  account_id: string;
  match_id: string;
  viewer_seat: SavedReplay["viewerSeat"];
  summary: SavedReplay["summary"];
  byte_size: number;
  created_at: string;
  drive_file_id: string | null;
  saved_at: string | null;
  visibility: SavedReplay["visibility"];
  format: string | null;
};
type SavedRow = IndexRow & { drive_file_id: string; saved_at: string };

export const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_TIMEOUT_MS = 15_000;
/** Rows the client never attached to a Drive file are only reachable from the match that made them. */
export const UNSAVED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export class ReplayLibraryError extends Error {
  readonly code: "sharing_disabled" | "drive_unavailable" | "too_large" | "invalid_cursor";
  constructor(code: ReplayLibraryError["code"]) {
    super(code);
    this.code = code;
  }
}

const view = (row: SavedRow): SavedReplay => ({
  id: row.id,
  matchId: row.match_id,
  summary: row.summary,
  viewerSeat: row.viewer_seat,
  bytes: row.byte_size,
  savedAt: Number(row.saved_at),
  driveFileId: row.drive_file_id,
  visibility: row.visibility,
});
const saved = (row: IndexRow | undefined): row is SavedRow => row?.drive_file_id != null;

function encodeCursor(row: SavedRow): string {
  return Buffer.from(`${row.saved_at}:${row.id}`).toString("base64url");
}
function decodeCursor(cursor: string): { savedAt: number; id: string } | undefined {
  const [savedAt, id, extra] = Buffer.from(cursor, "base64url").toString().split(":");
  const parsed = Number(savedAt);
  if (extra !== undefined || !id || !UUID.test(id) || !Number.isSafeInteger(parsed)) return undefined;
  return { savedAt: parsed, id };
}

export type ReplayIndexContext = {
  format?: DeckFormat;
  playerAccountIds: readonly [string | null, string | null];
};

type PublicReplayQuery = {
  viewerId?: string;
  cursor?: string;
  limit?: number;
  format?: DeckFormat;
};

const PUBLIC_REPLAYS = `SELECT r.* FROM account_replays r
  LEFT JOIN accounts a0 ON a0.id = r.player0_account_id
  LEFT JOIN accounts a1 ON a1.id = r.player1_account_id
  LEFT JOIN account_blocks b
    ON (b.blocker_id = r.account_id AND b.blocked_id = $1) OR (b.blocker_id = $1 AND b.blocked_id = r.account_id)
  WHERE r.published_at IS NOT NULL AND r.visibility = 'public' AND r.saved_at IS NOT NULL AND r.identities_recorded
    AND (r.player0_account_id IS NULL OR r.player0_account_id = r.account_id
      OR (a0.id IS NOT NULL AND COALESCE(a0.preferences->>'hideIdentityFromSpectators', 'false') <> 'true'))
    AND (r.player1_account_id IS NULL OR r.player1_account_id = r.account_id
      OR (a1.id IS NOT NULL AND COALESCE(a1.preferences->>'hideIdentityFromSpectators', 'false') <> 'true'))
    AND b.blocker_id IS NULL
    AND ($2::text IS NULL OR r.format = $2)
    AND ($3::bigint IS NULL OR r.saved_at < $3 OR (r.saved_at = $3 AND r.id < $4))
  ORDER BY r.saved_at DESC, r.id DESC LIMIT $5`;

const viewPublic = (row: SavedRow): PublicReplay => ({
  id: row.id,
  summary: row.summary,
  viewerSeat: row.viewer_seat,
  ...(isDeckFormat(row.format) ? { format: row.format } : {}),
  savedAt: Number(row.saved_at),
});

export interface DriveAccess {
  /** Google API key that reads files shared as "anyone with the link". Unset disables public sharing. */
  apiKey?: string;
  fetch?: typeof fetch;
}

export class ReplayLibrary {
  readonly friendFiles: FriendReplayStore;
  private readonly apiKey?: string;
  private readonly fetch: typeof fetch;

  constructor(
    private readonly accounts: AccountStore,
    drive: DriveAccess = {},
  ) {
    this.friendFiles = new FriendReplayStore(accounts);
    this.apiKey = drive.apiKey || undefined;
    this.fetch = drive.fetch ?? fetch;
  }

  get sharing(): boolean {
    return this.apiKey !== undefined;
  }

  /** Idempotent per account, match and seat; the room is the only caller, so the summary is trusted. */
  async record(
    accountId: string,
    message: Extract<ReplayDownloadMessage, { kind: "ready" }>,
    context?: ReplayIndexContext,
  ): Promise<string> {
    await this.accounts.ensureReady();
    const bytes = Buffer.byteLength(message.data, "base64");
    const result = await this.accounts.pool.query<{ id: string }>(
      `INSERT INTO account_replays
         (id,account_id,match_id,viewer_seat,summary,byte_size,created_at,
          format,player0_account_id,player1_account_id,identities_recorded)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (account_id,match_id,viewer_seat) DO UPDATE SET account_id=EXCLUDED.account_id
       RETURNING id`,
      [
        randomUUID(),
        accountId,
        message.summary.id,
        message.viewerSeat,
        JSON.stringify(message.summary),
        bytes,
        Date.now(),
        isDeckFormat(context?.format) ? context.format : null,
        context?.playerAccountIds[0] ?? null,
        context?.playerAccountIds[1] ?? null,
        context !== undefined,
      ],
    );
    return result.rows[0]!.id;
  }

  /**
   * Marks the caller's entry saved. Repeating the call is harmless; a different file id (the
   * player uploaded again) replaces the old one and makes the replay private, because the new
   * Drive file carries no public permission.
   */
  async attachDrive(accountId: string, id: string, fileId: string): Promise<SavedReplay | undefined> {
    await this.accounts.ensureReady();
    const row = (
      await this.accounts.pool.query<IndexRow>(
        `UPDATE account_replays SET
           visibility = CASE WHEN drive_file_id = $3 THEN visibility ELSE 'private' END,
           published_at = CASE WHEN drive_file_id = $3 THEN published_at ELSE NULL END,
           drive_file_id = $3,
           saved_at = COALESCE(saved_at, $4)
         WHERE id=$1 AND account_id=$2 RETURNING *`,
        [id, accountId, fileId, Date.now()],
      )
    ).rows[0];
    return saved(row) ? view(row) : undefined;
  }

  async list(accountId: string, options: { cursor?: string; limit?: number } = {}): Promise<ReplayLibraryPage> {
    await this.accounts.ensureReady();
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? REPLAY_PAGE_SIZE), 1), MAX_REPLAY_PAGE_SIZE);
    const after = options.cursor ? decodeCursor(options.cursor) : undefined;
    if (options.cursor && !after) throw new ReplayLibraryError("invalid_cursor");
    const rows = (
      await this.accounts.pool.query<SavedRow>(
        `SELECT * FROM account_replays
         WHERE account_id=$1 AND saved_at IS NOT NULL
           AND ($2::bigint IS NULL OR saved_at < $2 OR (saved_at = $2 AND id < $3))
         ORDER BY saved_at DESC, id DESC LIMIT $4`,
        [accountId, after?.savedAt ?? null, after?.id ?? null, limit + 1],
      )
    ).rows;
    const page = rows.slice(0, limit);
    return {
      replays: page.map(view),
      ...(rows.length > limit ? { nextCursor: encodeCursor(page.at(-1)!) } : {}),
      sharing: this.sharing,
      friendsSharing: true,
    };
  }

  async listPublic({ viewerId, cursor, limit, format }: PublicReplayQuery = {}): Promise<PublicReplayPage> {
    const size = Math.min(Math.max(Math.trunc(limit ?? PUBLIC_REPLAY_PAGE_SIZE), 1), MAX_PUBLIC_REPLAY_PAGE_SIZE);
    const after = cursor ? decodeCursor(cursor) : undefined;
    if (cursor && !after) {
      throw new ReplayLibraryError("invalid_cursor");
    }
    if (!this.sharing) {
      return { replays: [] };
    }
    await this.accounts.ensureReady();
    const rows = (
      await this.accounts.pool.query<SavedRow>(PUBLIC_REPLAYS, [
        viewerId ?? null,
        format ?? null,
        after?.savedAt ?? null,
        after?.id ?? null,
        size + 1,
      ])
    ).rows;
    const page = rows.slice(0, size);
    return {
      replays: page.map(viewPublic),
      ...(rows.length > size ? { nextCursor: encodeCursor(page.at(-1)!) } : {}),
    };
  }

  /** The caller's saved replays among the given matches, for the profile's match history. */
  async forMatches(accountId: string, matchIds: readonly string[]): Promise<SavedReplay[]> {
    if (!matchIds.length) return [];
    await this.accounts.ensureReady();
    const rows = (
      await this.accounts.pool.query<SavedRow>(
        "SELECT * FROM account_replays WHERE account_id=$1 AND saved_at IS NOT NULL AND match_id = ANY($2::text[])",
        [accountId, [...matchIds]],
      )
    ).rows;
    return rows.map(view);
  }

  async setVisibility(
    accountId: string,
    id: string,
    visibility: SavedReplay["visibility"],
  ): Promise<SavedReplay | undefined> {
    await this.accounts.ensureReady();
    if (visibility === ReplayVisibility.FRIENDS.value) {
      const stored = await this.accounts.pool.query(
        "SELECT 1 FROM friend_replay_files WHERE replay_id=$1 AND account_id=$2",
        [id, accountId],
      );
      if (!stored.rows.length) {
        return undefined;
      }
    }
    const row = (
      await this.accounts.pool.query<IndexRow>(
        `UPDATE account_replays SET visibility=$3,
           published_at = CASE WHEN $3 = 'public' THEN COALESCE(published_at, $4) ELSE NULL END
         WHERE id=$1 AND account_id=$2 AND saved_at IS NOT NULL RETURNING *`,
        [id, accountId, visibility, Date.now()],
      )
    ).rows[0];
    if (row && visibility !== ReplayVisibility.FRIENDS.value) {
      await this.accounts.pool.query("DELETE FROM friend_replay_files WHERE replay_id=$1", [id]);
    }
    return saved(row) ? view(row) : undefined;
  }

  async accessible(accountId: string | undefined, id: string): Promise<SharedReplay | undefined> {
    await this.accounts.ensureReady();
    const row = (
      await this.accounts.pool.query<IndexRow>("SELECT * FROM account_replays WHERE id=$1 AND saved_at IS NOT NULL", [
        id,
      ])
    ).rows[0];
    if (!saved(row)) {
      return undefined;
    }
    const result = { ...view(row), owned: row.account_id === accountId };
    if (result.owned || row.visibility === ReplayVisibility.PUBLIC.value) {
      return result;
    }
    if (row.visibility !== ReplayVisibility.FRIENDS.value || !accountId) {
      return undefined;
    }
    const friend = await this.accounts.pool.query("SELECT 1 FROM friendships WHERE account_id=$1 AND friend_id=$2", [
      row.account_id,
      accountId,
    ]);
    if (!friend.rows.length) {
      return undefined;
    }
    const blocks = await this.accounts.pool.query(
      "SELECT 1 FROM account_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)",
      [row.account_id, accountId],
    );
    return blocks.rows.length ? undefined : result;
  }

  async listForFriend({ accountId, friendId }: { accountId: string; friendId: string }): Promise<SavedReplay[]> {
    await this.accounts.ensureReady();
    const friend = await this.accounts.pool.query("SELECT 1 FROM friendships WHERE account_id=$1 AND friend_id=$2", [
      accountId,
      friendId,
    ]);
    if (!friend.rows.length) {
      return [];
    }
    const rows = (
      await this.accounts.pool.query<SavedRow>(
        "SELECT * FROM account_replays WHERE account_id=$1 AND saved_at IS NOT NULL AND visibility IN ('friends','public') ORDER BY saved_at DESC,id DESC LIMIT 50",
        [friendId],
      )
    ).rows;
    const visible = await Promise.all(
      rows.map(async (row) => ((await this.accessible(accountId, row.id)) ? view(row) : undefined)),
    );
    return visible.filter((replay): replay is SavedReplay => replay !== undefined);
  }

  /** Reads a public replay from Drive with the server's API key; owners download with their own token. */
  async publicFile(id: string): Promise<Buffer | undefined> {
    if (!this.apiKey) throw new ReplayLibraryError("sharing_disabled");
    const replay = await this.publicReplay(id);
    if (!replay) return undefined;
    const response = await this.fetch(
      `${DRIVE_FILES}/${encodeURIComponent(replay.driveFileId)}?alt=media&key=${encodeURIComponent(this.apiKey)}`,
      { signal: AbortSignal.timeout(DRIVE_TIMEOUT_MS) },
    );
    // Drive answers 403 or 404 once the owner trashed the file or removed the link permission.
    if (response.status === 403 || response.status === 404) {
      await response.body?.cancel();
      return undefined;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new ReplayLibraryError("drive_unavailable");
    }
    if (Number(response.headers.get("Content-Length") ?? 0) > MAX_REPLAY_BYTES) {
      await response.body.cancel();
      throw new ReplayLibraryError("too_large");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > MAX_REPLAY_BYTES) throw new ReplayLibraryError("too_large");
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks, size);
    // The client names the Drive file, so refuse to relay anything that is not an Aegis gzip archive.
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new ReplayLibraryError("drive_unavailable");
    // Check again after the download so a revocation during a slow transfer is respected.
    if (!(await this.publicReplay(id))) return undefined;
    return bytes;
  }

  private async publicReplay(id: string): Promise<SharedReplay | undefined> {
    const replay = await this.accessible(undefined, id);
    return replay?.visibility === "public" ? replay : undefined;
  }

  /** Removes only the index entry. The Drive file belongs to the player and stays unless they trash it. */
  async remove(accountId: string, id: string): Promise<boolean> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query("DELETE FROM account_replays WHERE id=$1 AND account_id=$2", [
      id,
      accountId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async cleanup(now = Date.now()): Promise<number> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      "DELETE FROM account_replays WHERE drive_file_id IS NULL AND created_at < $1",
      [now - UNSAVED_RETENTION_MS],
    );
    return result.rowCount ?? 0;
  }
}
