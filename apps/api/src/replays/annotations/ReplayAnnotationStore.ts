import { randomUUID } from "node:crypto";
import type { AccountStore } from "#api/accounts/AccountStore";
import { runFriendTransaction } from "#api/friends/runFriendTransaction";
import type { ReplayAnnotations } from "@aegis/shared/replays/annotations/ReplayAnnotations";
import type { ReplayMarker } from "@aegis/shared/replays/annotations/ReplayMarker";
import type { ReplayNote } from "@aegis/shared/replays/annotations/ReplayNote";
import {
  MAX_REPLAY_MARKERS_PER_MATCH,
  MAX_REPLAY_NOTES_PER_MATCH,
} from "@aegis/shared/replays/annotations/replayAnnotationLimits";
import { ReplayVisibility } from "@aegis/shared/replays/ReplayVisibility";
import type { SharedReplay } from "@aegis/shared/replays";

export const ANNOTATION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

type MomentRow = {
  id: string;
  match_id: string;
  frame_index: number;
  turn: number;
  created_at: string;
};
type MarkerRow = MomentRow & { emoji: string };
type NoteRow = MomentRow & { body: string; updated_at: string };

type ReplayAccess = {
  accessible: (accountId: string | undefined, id: string) => Promise<SharedReplay | undefined>;
};

type MatchParams = { accountId: string; matchId: string };
type ListParams = { viewerId: string | undefined; matchId: string };
type MomentParams = { authorId: string; matchId: string; frameIndex: number; turn: number; now?: number };
type AddMarkerParams = MomentParams & { emoji: string };
type AddNoteParams = MomentParams & { text: string };
type UpdateNoteParams = { authorId: string; matchId: string; noteId: string; text: string; now?: number };
type RemoveParams = { authorId: string; matchId: string; id: string };
type AuthorParams = { authorId: string; matchId: string };

export type AddMarkerResult = { kind: "added"; marker: ReplayMarker } | { kind: "limit_reached" };
export type AddNoteResult = { kind: "added"; note: ReplayNote } | { kind: "limit_reached" };

const ANNOTATION_TABLES = ["replay_markers", "replay_notes"] as const;

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

function toNote(row: NoteRow): ReplayNote {
  return {
    id: row.id,
    matchId: row.match_id,
    frameIndex: row.frame_index,
    turn: row.turn,
    text: row.body,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
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
    await this.accounts.ensureReady();
    if (!viewerId) {
      return { markers: [], notes: [], canAnnotate: false, ownReplayIds: [] };
    }
    const own = await this.listByAuthor({ authorId: viewerId, matchId });
    const ownReplays = await this.accounts.pool.query<{ id: string }>(
      "SELECT id FROM account_replays WHERE account_id=$1 AND match_id=$2 AND saved_at IS NOT NULL ORDER BY saved_at, id",
      [viewerId, matchId],
    );
    return {
      ...own,
      canAnnotate: await this.canAnnotate({ accountId: viewerId, matchId }),
      ownReplayIds: ownReplays.rows.map((row) => row.id),
    };
  }

  private async listByAuthor({ authorId, matchId }: AuthorParams) {
    const markers = await this.accounts.pool.query<MarkerRow>(
      "SELECT * FROM replay_markers WHERE author_id=$1 AND match_id=$2 ORDER BY frame_index, created_at, id",
      [authorId, matchId],
    );
    const notes = await this.accounts.pool.query<NoteRow>(
      "SELECT * FROM replay_notes WHERE author_id=$1 AND match_id=$2 ORDER BY frame_index, created_at, id",
      [authorId, matchId],
    );
    return { markers: markers.rows.map(toMarker), notes: notes.rows.map(toNote) };
  }

  async addMarker({ authorId, matchId, frameIndex, turn, emoji, now = Date.now() }: AddMarkerParams) {
    return runFriendTransaction<AddMarkerResult>({
      accounts: this.accounts,
      accountIds: [authorId],
      run: async (db) => {
        const count = await db.query<{ total: string }>(
          "SELECT count(*) AS total FROM replay_markers WHERE author_id=$1 AND match_id=$2",
          [authorId, matchId],
        );
        if (Number(count.rows[0]?.total ?? 0) >= MAX_REPLAY_MARKERS_PER_MATCH) {
          return { kind: "limit_reached" };
        }
        const row = await db.query<MarkerRow>(
          `INSERT INTO replay_markers (id,author_id,match_id,frame_index,turn,emoji,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [randomUUID(), authorId, matchId, frameIndex, turn, emoji, now],
        );
        return { kind: "added", marker: toMarker(row.rows[0]!) };
      },
    });
  }

  async addNote({ authorId, matchId, frameIndex, turn, text, now = Date.now() }: AddNoteParams) {
    return runFriendTransaction<AddNoteResult>({
      accounts: this.accounts,
      accountIds: [authorId],
      run: async (db) => {
        const count = await db.query<{ total: string }>(
          "SELECT count(*) AS total FROM replay_notes WHERE author_id=$1 AND match_id=$2",
          [authorId, matchId],
        );
        if (Number(count.rows[0]?.total ?? 0) >= MAX_REPLAY_NOTES_PER_MATCH) {
          return { kind: "limit_reached" };
        }
        const row = await db.query<NoteRow>(
          `INSERT INTO replay_notes (id,author_id,match_id,frame_index,turn,body,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
          [randomUUID(), authorId, matchId, frameIndex, turn, text, now],
        );
        return { kind: "added", note: toNote(row.rows[0]!) };
      },
    });
  }

  async updateNote({ authorId, matchId, noteId, text, now = Date.now() }: UpdateNoteParams) {
    await this.accounts.ensureReady();
    const row = await this.accounts.pool.query<NoteRow>(
      "UPDATE replay_notes SET body=$4, updated_at=$5 WHERE id=$1 AND author_id=$2 AND match_id=$3 RETURNING *",
      [noteId, authorId, matchId, text, now],
    );
    return row.rows[0] ? toNote(row.rows[0]) : undefined;
  }

  async removeMarker({ authorId, matchId, id }: RemoveParams): Promise<boolean> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      "DELETE FROM replay_markers WHERE id=$1 AND author_id=$2 AND match_id=$3",
      [id, authorId, matchId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async removeNote({ authorId, matchId, id }: RemoveParams): Promise<boolean> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      "DELETE FROM replay_notes WHERE id=$1 AND author_id=$2 AND match_id=$3",
      [id, authorId, matchId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async cleanup(now = Date.now()): Promise<number> {
    await this.accounts.ensureReady();
    let removed = 0;
    for (const table of ANNOTATION_TABLES) {
      const result = await this.accounts.pool.query(
        `DELETE FROM ${table} WHERE created_at < $1 AND match_id NOT IN (SELECT match_id FROM account_replays)`,
        [now - ANNOTATION_GRACE_MS],
      );
      removed += result.rowCount ?? 0;
    }
    return removed;
  }
}
