import { canWatchSocialRoom } from "#api/social/canWatchSocialRoom";
import { randomUUID } from "node:crypto";
import type { Presence } from "colyseus";
import type { AccountStore } from "#api/accounts/AccountStore";
import { FriendStore } from "#api/friends/FriendStore";
import type { MatchInvite } from "@aegis/shared/social/MatchInvite";
import type { SocialPresence } from "@aegis/shared/social/SocialPresence";
import { SocialStatus } from "@aegis/shared/social/SocialStatus";
import type { SocialEvent } from "@aegis/shared/protocol/social";

type PrivateRoomInfo = { hostAccountId?: string; waiting: boolean };
type SocialServiceParams = {
  accounts: AccountStore;
  presence: Presence;
  resolveRoom: (code: string) => Promise<PrivateRoomInfo | undefined>;
  now?: () => number;
  canWatch?: (params: { code: string; viewerId: string }) => Promise<boolean>;
};
type WritePresenceParams = { accountId: string; connectionId: string; status: SocialStatus; roomCode?: string };
type DeletePresenceParams = { accountId: string; connectionId: string };
type InviteParams = { senderId: string; recipientId: string; roomCode: string };
type AnswerInviteParams = { accountId: string; inviteId: string; accept: boolean };
type VisiblePresenceParams = { viewerId: string; presence: SocialPresence };
type Lease = { status: SocialStatus; roomCode?: string; expiresAt: number };

export class SocialService {
  private readonly now: () => number;
  constructor(private readonly dependencies: SocialServiceParams) {
    this.now = dependencies.now ?? Date.now;
  }

  get accounts(): AccountStore {
    return this.dependencies.accounts;
  }
  get presence(): Presence {
    return this.dependencies.presence;
  }

  async canInteract(accountId: string, otherId: string): Promise<boolean> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      "SELECT 1 FROM friendships f WHERE f.account_id=$1 AND f.friend_id=$2 AND NOT EXISTS (SELECT 1 FROM account_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=$1))",
      [accountId, otherId],
    );
    return result.rows.length > 0;
  }

  async readPresence(accountId: string): Promise<SocialPresence> {
    const connections = await this.presence.smembers(`social:presence:${accountId}`);
    const active: Lease[] = [];
    for (const connectionId of connections) {
      const raw = await this.presence.get(`social:lease:${accountId}:${connectionId}`);
      const lease = raw ? (JSON.parse(raw) as Lease) : undefined;
      if (lease && lease.expiresAt > this.now()) {
        active.push(lease);
      } else {
        await this.presence.srem(`social:presence:${accountId}`, connectionId);
      }
    }
    active.sort((first, second) => getPriority(second.status) - getPriority(first.status));
    const lease = active[0];
    return { accountId, status: lease?.status ?? null, ...(lease?.roomCode ? { roomCode: lease.roomCode } : {}) };
  }

  async writePresence({ accountId, connectionId, status, roomCode }: WritePresenceParams): Promise<void> {
    const before = await this.readPresence(accountId);
    await this.presence.setex(
      `social:lease:${accountId}:${connectionId}`,
      JSON.stringify({ status, roomCode, expiresAt: this.now() + 45_000 }),
      45,
    );
    await this.presence.sadd(`social:presence:${accountId}`, connectionId);
    await this.presence.expire(`social:presence:${accountId}`, 60);
    const after = await this.readPresence(accountId);
    if (before.status !== after.status || before.roomCode !== after.roomCode) {
      await this.publishPresence(after);
    }
  }

  async deletePresence({ accountId, connectionId }: DeletePresenceParams): Promise<void> {
    await this.presence.del(`social:lease:${accountId}:${connectionId}`);
    await this.presence.srem(`social:presence:${accountId}`, connectionId);
    await this.publishPresence(await this.readPresence(accountId));
  }

  async snapshot(accountId: string): Promise<Extract<SocialEvent, { kind: "friendsSnapshot" }>> {
    const friends = await new FriendStore(this.accounts).list(accountId);
    return {
      kind: "friendsSnapshot",
      friends: await Promise.all(
        friends.map(async (friend) => ({
          ...friend,
          ...(await this.visiblePresence({ viewerId: accountId, presence: await this.readPresence(friend.accountId) })),
        })),
      ),
    };
  }

  async visiblePresence({ viewerId, presence }: VisiblePresenceParams): Promise<SocialPresence> {
    if (
      !presence.roomCode ||
      (await (this.dependencies.canWatch ?? canWatchSocialRoom)({ code: presence.roomCode, viewerId }))
    ) {
      return presence;
    }
    return { accountId: presence.accountId, status: presence.status };
  }

  async publishChanges(accountIds: readonly string[]): Promise<void> {
    for (const id of new Set(accountIds)) {
      await this.publish({ accountId: id, event: { kind: "friendsChanged" } });
      await this.publish({ accountId: id, event: { kind: "notificationsChanged" } });
    }
  }

  async publish({ accountId, event }: { accountId: string; event: SocialEvent }): Promise<void> {
    await this.presence.publish(`social:account:${accountId}`, event);
  }

  async invite({ senderId, recipientId, roomCode }: InviteParams): Promise<MatchInvite | undefined> {
    if (!(await this.canInteract(senderId, recipientId))) {
      return undefined;
    }
    const room = await this.dependencies.resolveRoom(roomCode);
    if (!room?.waiting || room.hostAccountId !== senderId) {
      return undefined;
    }
    const account = await this.accounts.account(senderId);
    if (!account) {
      return undefined;
    }
    const invite: MatchInvite = {
      id: randomUUID(),
      senderId,
      recipientId,
      senderName: account.displayName,
      roomCode,
      expiresAt: this.now() + 60_000,
    };
    await this.presence.setex(`social:invite:${invite.id}`, JSON.stringify(invite), 120);
    for (const accountId of [senderId, recipientId]) {
      await this.presence.sadd(`social:invites:${accountId}`, invite.id);
      await this.presence.expire(`social:invites:${accountId}`, 120);
      await this.publish({ accountId, event: { kind: "matchInvite", invite } });
    }
    return invite;
  }

  async readInvites(accountId: string): Promise<MatchInvite[]> {
    const ids = await this.presence.smembers(`social:invites:${accountId}`);
    const result: MatchInvite[] = [];
    for (const id of ids) {
      const raw = await this.presence.get(`social:invite:${id}`);
      const invite = raw ? (JSON.parse(raw) as MatchInvite) : undefined;
      const valid =
        invite &&
        invite.expiresAt > this.now() &&
        (await this.canInteract(invite.senderId, invite.recipientId)) &&
        (await this.isInviteRoomOpen(invite));
      if (valid && invite) {
        result.push(invite);
      } else {
        await this.presence.srem(`social:invites:${accountId}`, id);
        await this.publish({ accountId, event: { kind: "inviteExpired", inviteId: id } });
      }
    }
    return result;
  }

  async answer({ accountId, inviteId, accept }: AnswerInviteParams): Promise<MatchInvite | undefined> {
    const invites = await this.readInvites(accountId);
    const invite = invites.find((entry) => entry.id === inviteId && entry.recipientId === accountId);
    if (!invite) {
      return undefined;
    }
    const claimKey = `social:invite-answer:${inviteId}`;
    const claim = await this.presence.incr(claimKey);
    await this.presence.expire(claimKey, 120);
    if (claim !== 1) {
      return undefined;
    }
    await this.presence.del(`social:invite:${inviteId}`);
    for (const targetId of [invite.senderId, invite.recipientId]) {
      await this.presence.srem(`social:invites:${targetId}`, inviteId);
      await this.publish({ accountId: targetId, event: { kind: "inviteAnswered", inviteId, accepted: accept } });
    }
    return invite;
  }

  private async isInviteRoomOpen(invite: MatchInvite): Promise<boolean> {
    const room = await this.dependencies.resolveRoom(invite.roomCode);
    return room?.waiting === true && room.hostAccountId === invite.senderId;
  }

  private async publishPresence(presence: SocialPresence): Promise<void> {
    for (const friend of await new FriendStore(this.accounts).list(presence.accountId)) {
      await this.publish({ accountId: friend.accountId, event: { kind: "presenceChanged", presence } });
    }
  }
}

function getPriority(status: SocialStatus): number {
  return Object.values(SocialStatus).find((entry) => entry.value === status)?.priority ?? 0;
}
