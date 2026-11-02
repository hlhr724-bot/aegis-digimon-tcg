import { gunzipSync } from "node:zlib";
import type { AccountStore } from "#api/accounts/AccountStore";
import { runFriendTransaction } from "#api/friends/runFriendTransaction";
import { MAX_REPLAY_BYTES, REPLAY_FORMAT_VERSION, type SavedReplay } from "@aegis/shared/replays";
import { ReplayVisibility } from "@aegis/shared/replays/ReplayVisibility";

type SaveFriendReplayParams = { accountId: string; replayId: string; archive: Buffer };
type ReplayRow = { match_id: string; viewer_seat: SavedReplay["viewerSeat"] };

export class FriendReplayStore {
  constructor(private readonly accounts: AccountStore) {}

  async save({ accountId, replayId, archive }: SaveFriendReplayParams): Promise<boolean> {
    if (archive.length === 0 || archive.length > MAX_REPLAY_BYTES || archive[0] !== 0x1f || archive[1] !== 0x8b) {
      return false;
    }
    let parsed: { format?: string; version?: number; id?: string; viewerSeat?: number };
    try {
      parsed = JSON.parse(gunzipSync(archive, { maxOutputLength: MAX_REPLAY_BYTES }).toString());
    } catch {
      return false;
    }
    if (!parsed || parsed.format !== "aegis-replay" || parsed.version !== REPLAY_FORMAT_VERSION) {
      return false;
    }
    return runFriendTransaction({
      accounts: this.accounts,
      accountIds: [accountId],
      run: async (db) => {
        const replay = (
          await db.query<ReplayRow>(
            "SELECT match_id,viewer_seat FROM account_replays WHERE id=$1 AND account_id=$2 AND saved_at IS NOT NULL",
            [replayId, accountId],
          )
        ).rows[0];
        if (!replay || parsed.id !== replay.match_id || parsed.viewerSeat !== replay.viewer_seat) {
          return false;
        }
        const bytes = (
          await db.query<{ total: string }>(
            "SELECT COALESCE(sum(byte_size),0) AS total FROM friend_replay_files WHERE account_id=$1 AND replay_id<>$2",
            [accountId, replayId],
          )
        ).rows[0];
        if (Number(bytes?.total ?? 0) + archive.length > 128 * 1024 * 1024) {
          return false;
        }
        await db.query(
          "INSERT INTO friend_replay_files (replay_id,account_id,archive,byte_size,created_at) VALUES ($1,$2,decode($3,'base64'),$4,$5) ON CONFLICT (replay_id) DO UPDATE SET archive=EXCLUDED.archive,byte_size=EXCLUDED.byte_size,created_at=EXCLUDED.created_at",
          [replayId, accountId, archive.toString("base64"), archive.length, Date.now()],
        );
        await db.query("UPDATE account_replays SET visibility=$2 WHERE id=$1", [
          replayId,
          ReplayVisibility.FRIENDS.value,
        ]);
        return true;
      },
    });
  }

  async read(replayId: string): Promise<Buffer | undefined> {
    await this.accounts.ensureReady();
    const row = (
      await this.accounts.pool.query<{ archive: string }>(
        "SELECT encode(archive,'base64') AS archive FROM friend_replay_files WHERE replay_id=$1",
        [replayId],
      )
    ).rows[0];
    return row ? Buffer.from(row.archive, "base64") : undefined;
  }
}
