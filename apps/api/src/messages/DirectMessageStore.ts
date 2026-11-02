import { randomUUID } from "node:crypto";
import type { AccountStore } from "#api/accounts/AccountStore";
import { runFriendTransaction } from "#api/friends/runFriendTransaction";
import { maskBlockedWords } from "#api/moderation/blockedWords";
import { CHAT_COOLDOWN_MS, CHAT_TEXT_MAX_LENGTH, normalizeChatText } from "@aegis/shared/protocol/chat";
import type { DirectMessage } from "@aegis/shared/messages/DirectMessage";
import type { ConversationSummary } from "@aegis/shared/messages/ConversationSummary";
import type { PoolClient } from "pg";
import { FeedbackStore } from "#api/bugs/FeedbackStore";

const RETENTION_MS = 30 * 24 * 60 * 60_000;
type PairParams = { accountId: string; friendId: string };
type SendParams = PairParams & { body: string };
type ListParams = PairParams & { before?: number };
type ReportParams = { accountId: string; messageId: string };
type MessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export class DirectMessageStore {
  constructor(
    private readonly accounts: AccountStore,
    private readonly now: () => number = Date.now,
  ) {}

  async send({ accountId, friendId, body }: SendParams): Promise<DirectMessage | undefined> {
    if (typeof body !== "string" || body.length > CHAT_TEXT_MAX_LENGTH * 4) {
      return undefined;
    }
    const text = maskBlockedWords(normalizeChatText(body));
    if (!text) {
      return undefined;
    }
    return runFriendTransaction({
      accounts: this.accounts,
      accountIds: [accountId, friendId],
      run: async (client) => {
        if (!(await canMessage({ client, accountId, friendId }))) {
          return undefined;
        }
        const recent = await client.query(
          "SELECT created_at FROM direct_messages WHERE sender_id=$1 ORDER BY created_at DESC LIMIT 1",
          [accountId],
        );
        const now = this.now();
        if (recent.rows[0] && now - Number(recent.rows[0].created_at) < CHAT_COOLDOWN_MS) {
          return undefined;
        }
        const message: DirectMessage = {
          id: randomUUID(),
          senderId: accountId,
          recipientId: friendId,
          body: text,
          createdAt: now,
          readAt: null,
        };
        await client.query(
          "INSERT INTO direct_messages (id,sender_id,recipient_id,body,created_at) VALUES ($1,$2,$3,$4,$5)",
          [message.id, accountId, friendId, text, now],
        );
        return message;
      },
    });
  }

  async list({ accountId, friendId, before }: ListParams): Promise<DirectMessage[] | undefined> {
    return runFriendTransaction({
      accounts: this.accounts,
      accountIds: [accountId, friendId],
      run: async (client) => {
        if (!(await canMessage({ client, accountId, friendId }))) {
          return undefined;
        }
        const result = await client.query<MessageRow>(
          "SELECT * FROM direct_messages WHERE ((sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)) AND created_at>$3 AND created_at<$4 ORDER BY created_at DESC, id DESC LIMIT 50",
          [accountId, friendId, this.now() - RETENTION_MS, before ?? this.now() + 1],
        );
        return result.rows.map(buildMessage).reverse();
      },
    });
  }

  async markRead({ accountId, friendId }: PairParams): Promise<number | undefined> {
    return runFriendTransaction({
      accounts: this.accounts,
      accountIds: [accountId, friendId],
      run: async (client) => {
        if (!(await canMessage({ client, accountId, friendId }))) {
          return undefined;
        }
        const at = this.now();
        await client.query(
          "UPDATE direct_messages SET read_at=$3 WHERE recipient_id=$1 AND sender_id=$2 AND read_at IS NULL",
          [accountId, friendId, at],
        );
        return at;
      },
    });
  }

  async conversations(accountId: string): Promise<ConversationSummary[]> {
    await this.accounts.ensureReady();
    const since = this.now() - RETENTION_MS;
    const latest = await this.accounts.pool.query<MessageRow & { friend_id: string }>(
      "WITH latest AS (SELECT CASE WHEN sender_id=$1 THEN recipient_id ELSE sender_id END AS friend_id, MAX(created_at) AS created_at FROM direct_messages WHERE (sender_id=$1 OR recipient_id=$1) AND created_at>$2 GROUP BY CASE WHEN sender_id=$1 THEN recipient_id ELSE sender_id END) SELECT m.*, l.friend_id FROM latest l JOIN direct_messages m ON m.created_at=l.created_at AND ((m.sender_id=$1 AND m.recipient_id=l.friend_id) OR (m.recipient_id=$1 AND m.sender_id=l.friend_id)) JOIN friendships f ON f.account_id=$1 AND f.friend_id=l.friend_id LEFT JOIN account_blocks b ON (b.blocker_id=$1 AND b.blocked_id=l.friend_id) OR (b.blocker_id=l.friend_id AND b.blocked_id=$1) WHERE b.blocker_id IS NULL ORDER BY m.id",
      [accountId, since],
    );
    const unread = await this.accounts.pool.query<{ sender_id: string; count: string }>(
      "SELECT m.sender_id, COUNT(*) AS count FROM direct_messages m JOIN friendships f ON f.account_id=m.recipient_id AND f.friend_id=m.sender_id LEFT JOIN account_blocks b ON (b.blocker_id=m.sender_id AND b.blocked_id=m.recipient_id) OR (b.blocker_id=m.recipient_id AND b.blocked_id=m.sender_id) WHERE m.recipient_id=$1 AND m.read_at IS NULL AND m.created_at>$2 AND b.blocker_id IS NULL GROUP BY m.sender_id",
      [accountId, since],
    );
    const unreadByFriend = new Map(unread.rows.map((row) => [row.sender_id, Number(row.count)]));
    const lastByFriend = new Map(latest.rows.map((row) => [row.friend_id, buildMessage(row)]));
    return [...lastByFriend].map(([friendId, lastMessage]) => ({
      friendId,
      unread: unreadByFriend.get(friendId) ?? 0,
      lastMessage,
    }));
  }

  async report({ accountId, messageId }: ReportParams): Promise<number | undefined> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query<MessageRow>(
      "SELECT * FROM direct_messages WHERE id=$1 AND recipient_id=$2 AND created_at>$3",
      [messageId, accountId, this.now() - RETENTION_MS],
    );
    const message = result.rows[0];
    if (!message) {
      return undefined;
    }
    return new FeedbackStore(this.accounts).save(
      {
        kind: "other",
        summary: "Direct message abuse report",
        description: JSON.stringify({
          messageId,
          senderId: message.sender_id,
          recipientId: accountId,
          body: message.body,
          createdAt: Number(message.created_at),
        }),
        cardIds: [],
      },
      accountId,
      false,
    );
  }

  async cleanup(): Promise<void> {
    await this.accounts.ensureReady();
    await this.accounts.pool.query("DELETE FROM direct_messages WHERE created_at<=$1", [this.now() - RETENTION_MS]);
  }
}

type CanMessageParams = PairParams & { client: PoolClient };
async function canMessage({ client, accountId, friendId }: CanMessageParams): Promise<boolean> {
  const friendship = await client.query("SELECT 1 FROM friendships WHERE account_id=$1 AND friend_id=$2", [
    accountId,
    friendId,
  ]);
  if (!friendship.rows.length) {
    return false;
  }
  const blocks = await client.query(
    "SELECT 1 FROM account_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)",
    [accountId, friendId],
  );
  return blocks.rows.length === 0;
}
function buildMessage(row: MessageRow): DirectMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: row.body,
    createdAt: Number(row.created_at),
    readAt: row.read_at === null ? null : Number(row.read_at),
  };
}
