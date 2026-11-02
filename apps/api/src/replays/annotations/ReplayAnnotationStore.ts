import { randomUUID } from "node:crypto";
import type { AccountStore } from "#api/accounts/AccountStore";
import { runFriendTransaction } from "#api/friends/runFriendTransaction";
import type { ReplayAnnotations } from "@aegis/shared/replays/annotations/ReplayAnnotations";
import type { ReplayMarker } from "@aegis/shared/replays/annotations/ReplayMarker";
import type { ReplayMarkerEmoji } from "@aegis/shared/replays/annotations/ReplayMarkerEmoji";
import { MAX_REPLAY_MARKERS_PER_MATCH } from "@aegis/shared/replays/annotations/replayAnnotationLimits";
import { ReplayVisibility } from "@aegis/shared/replays/ReplayVisibility";
import type { SharedReplay } from "@aegis/shared/replays";

export const ANNOTATION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

type MarkerRow = {
  id: string;
  match_id: string;
  frame_index: number;
  turn: number;
  emoji: ReplayMarkerEmoji;
  created_at: string;
};

type ReplayAccess = {
  accessible: (accountId: string | undefined, id: string) => Promise<SharedReplay | undefined>;
};

type MatchParams = { accountId: string; matchId: string };
type ListParams = { viewerId: string | undefined; matchId: string };
type AddMarkerParams = {
  authorId: string;
  matchId: string;
  frameIndex: number;
  turn: number;
  emoji: ReplayMarkerEmoji;
  now?: number;
};
type RemoveMarkerParams = { authorId: string; matchId: string; markerId: string };

export type AddMarkerResult = { kind: "added"; marker: ReplayMarker } | { kind: "limit_reached" };

function toMarker(row: MarkerRow): ReplayMarker {
  return {
    id: row.id,
    matchId: row.match_id,
    frameIndex: row.frame_index,
    turn: row.turn,
    emoji: row.emoji,
    createdAt: Number(row.created_at),
  };
}

export class ReplayAnnotationStore {
  constructor(
    private readonly accounts: AccountStore,
    private readonly replays: ReplayAccess,
  ) {}

  async canAnnotate({ accountId, matchId }: MatchParams): Promise<boolean> {
    await this.accounts.ensureReady();
    const own = await this.accounts.pool.query("SELECT 1 FROM account_replays WHERE account_id=$1 AND match_id=$2", [
      accountId,
      matchId,
    ]);
    if (own.rows.length) {
      return true;
    }
    const shared = (
      await this.accounts.pool.query<{ id: string }>(
        "SELECT id FROM account_replays WHERE match_id=$1 AND saved_at IS NOT NULL AND visibility IN ($2,$3)",
        [matchId, ReplayVisibility.FRIENDS.value, ReplayVisibility.PUBLIC.value],
      )
    ).rows;
    for (const row of shared) {
      if (await this.replays.accessible(accountId, row.id)) {
        return true;
      }
    }
    return false;
  }

  async list({ viewerId, matchId }: ListParams): Promise<ReplayAnnotations> {
    if (!viewerId) {
      return { markers: [], canAnnotate: false };
    }
    await this.accounts.ensureReady();
    const rows = (
      await this.accounts.pool.query<MarkerRow>(
        "SELECT * FROM replay_markers WHERE author_id=$1 AND match_id=$2 ORDER BY frame_index, created_at, id",
        [viewerId, matchId],
      )
    ).rows;
    return { markers: rows.map(toMarker), canAnnotate: await this.canAnnotate({ accountId: viewerId, matchId }) };
  }

  async addMarker({ authorId, matchId, frameIndex, turn, emoji, now = Date.now() }: AddMarkerParams) {
    return runFriendTransaction<AddMarkerResult>({
      accounts: this.accounts,
      accountIds: [authorId],
      run: async (db) => {
        const count = (
          await db.query<{ total: string }>(
            "SELECT count(*) AS total FROM replay_markers WHERE author_id=$1 AND match_id=$2",
            [authorId, matchId],
          )
        ).rows[0];
        if (Number(count?.total ?? 0) >= MAX_REPLAY_MARKERS_PER_MATCH) {
          return { kind: "limit_reached" };
        }
        const row = (
          await db.query<MarkerRow>(
            `INSERT INTO replay_markers (id,author_id,match_id,frame_index,turn,emoji,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [randomUUID(), authorId, matchId, frameIndex, turn, emoji, now],
          )
        ).rows[0]!;
        return { kind: "added", marker: toMarker(row) };
      },
    });
  }

  async removeMarker({ authorId, matchId, markerId }: RemoveMarkerParams): Promise<boolean> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      "DELETE FROM replay_markers WHERE id=$1 AND author_id=$2 AND match_id=$3",
      [markerId, authorId, matchId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async cleanup(now = Date.now()): Promise<number> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      "DELETE FROM replay_markers WHERE created_at < $1 AND match_id NOT IN (SELECT match_id FROM account_replays)",
      [now - ANNOTATION_GRACE_MS],
    );
    return result.rowCount ?? 0;
  }
}
