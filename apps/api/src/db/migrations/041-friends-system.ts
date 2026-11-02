import type { Migration } from "#api/db/migrator";

export const friendsSystem: Migration = {
  id: "041-friends-system",
  lock: "LOCK TABLE accounts, account_replays IN ACCESS EXCLUSIVE MODE NOWAIT",
  up: `
    CREATE TABLE friend_requests (
      requester_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      recipient_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at bigint NOT NULL,
      PRIMARY KEY (requester_id, recipient_id),
      CHECK (requester_id <> recipient_id)
    );
    CREATE INDEX friend_requests_recipient ON friend_requests(recipient_id);
    CREATE TABLE friendships (
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      friend_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at bigint NOT NULL,
      PRIMARY KEY (account_id, friend_id),
      CHECK (account_id <> friend_id)
    );
    CREATE TABLE account_blocks (
      blocker_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      blocked_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at bigint NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id),
      CHECK (blocker_id <> blocked_id)
    );
    CREATE INDEX account_blocks_blocked ON account_blocks(blocked_id);
    CREATE TABLE account_replays_social (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES accounts(id),
      match_id text NOT NULL,
      viewer_seat integer NOT NULL CHECK (viewer_seat IN (-1,0,1)),
      summary jsonb NOT NULL,
      byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 33554432),
      created_at bigint NOT NULL,
      drive_file_id text,
      saved_at bigint,
      visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','friends','public')),
      CHECK ((drive_file_id IS NULL) = (saved_at IS NULL)),
      CHECK (visibility = 'private' OR drive_file_id IS NOT NULL),
      UNIQUE (account_id, match_id, viewer_seat)
    );
    INSERT INTO account_replays_social (id,account_id,match_id,viewer_seat,summary,byte_size,created_at,drive_file_id,saved_at,visibility) SELECT id,account_id,match_id,viewer_seat,summary,byte_size,created_at,drive_file_id,saved_at,visibility FROM account_replays;
    DROP INDEX account_replays_library;
    DROP INDEX account_replays_unsaved;
    DROP TABLE account_replays;
    ALTER TABLE account_replays_social RENAME TO account_replays;
    CREATE INDEX account_replays_library ON account_replays(account_id, saved_at DESC, id DESC);
    CREATE INDEX account_replays_unsaved ON account_replays(created_at);
    CREATE TABLE friend_replay_files (
      replay_id uuid PRIMARY KEY REFERENCES account_replays(id) ON DELETE CASCADE,
      account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      archive bytea NOT NULL,
      byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 33554432),
      created_at bigint NOT NULL
    );
    CREATE INDEX friend_replay_files_owner ON friend_replay_files(account_id);
    CREATE TABLE direct_messages (
      id uuid PRIMARY KEY,
      sender_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      recipient_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      body varchar(480) NOT NULL CHECK (body <> ''),
      created_at bigint NOT NULL,
      read_at bigint,
      CHECK (sender_id <> recipient_id)
    );
    CREATE INDEX direct_messages_sender ON direct_messages(sender_id, recipient_id, created_at DESC, id DESC);
    CREATE INDEX direct_messages_recipient ON direct_messages(recipient_id, sender_id, created_at DESC, id DESC);
    CREATE INDEX direct_messages_retention ON direct_messages(created_at);
  `,
};
