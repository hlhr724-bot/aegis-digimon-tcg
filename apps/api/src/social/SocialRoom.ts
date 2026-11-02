import { DirectMessageStore } from "#api/messages/DirectMessageStore";
import { Room, ServerError, type Client } from "colyseus";
import { accountStore } from "#api/accounts/runtime";
import { SocialService } from "#api/social/SocialService";
import { resolveSocialInviteRoom } from "#api/social/resolveSocialInviteRoom";
import { SocialStatus } from "@aegis/shared/social/SocialStatus";
import type { SocialEvent, SocialIntent } from "@aegis/shared/protocol/social";
import { tokenBucketLimiter } from "#api/http/rateLimit";

const rooms = new WeakMap<object, string>();

export class SocialRoom extends Room {
  override maxClients = 10_000;
  override autoDispose = false;
  private service!: SocialService;
  private readonly accountByClient = new Map<string, string>();
  private readonly subscriptions = new Map<string, (event: SocialEvent) => void>();
  private readonly refreshLimit = tokenBucketLimiter({ capacity: 5, refillMs: 2000 });
  private readonly messageLimit = tokenBucketLimiter({ capacity: 5, refillMs: 1500 });
  private readonly limit = tokenBucketLimiter({ capacity: 3, refillMs: 20_000 });

  override onCreate(): void {
    if (rooms.has(this.presence)) {
      throw new ServerError(409, "Social room already exists on this process");
    }
    rooms.set(this.presence, this.roomId);
    this.service = this.createSocialService();
    this.onMessage("social", (client, payload: unknown) => {
      void this.handleIntent(client, payload).catch(() =>
        client.send("social", { kind: "error", error: "unavailable" }),
      );
    });
    this.clock.setInterval(() => {
      void this.refreshConnections().catch(() => undefined);
    }, 10_000);
  }

  override async onAuth(_client: Client, options: { authTicket?: string }): Promise<{ accountId: string } | false> {
    const ticket = await this.service.accounts.consumeRoomTicket(options.authTicket);
    if (!ticket || ticket.tournamentMatchId) {
      return false;
    }
    return { accountId: ticket.account.id };
  }

  override async onJoin(client: Client): Promise<void> {
    const accountId = (client.auth as { accountId: string }).accountId;
    this.accountByClient.set(client.sessionId, accountId);
    if (!this.subscriptions.has(accountId)) {
      const receive = (event: SocialEvent) => {
        void this.deliver({ accountId, event }).catch(() => undefined);
      };
      this.subscriptions.set(accountId, receive);
      await this.presence.subscribe(`social:account:${accountId}`, receive);
    }
    await this.service.writePresence({ accountId, connectionId: client.sessionId, status: SocialStatus.ONLINE.value });
    client.send("social", await this.unreadMessages(accountId));
    client.send("social", await this.service.snapshot(accountId));
    for (const invite of await this.service.readInvites(accountId)) {
      client.send("social", { kind: "matchInvite", invite });
    }
  }

  override async onLeave(client: Client): Promise<void> {
    const accountId = this.accountByClient.get(client.sessionId);
    this.accountByClient.delete(client.sessionId);
    if (!accountId) {
      return;
    }
    await this.service.deletePresence({ accountId, connectionId: client.sessionId });
    if (![...this.accountByClient.values()].includes(accountId)) {
      await this.presence.unsubscribe(`social:account:${accountId}`, this.subscriptions.get(accountId));
      this.subscriptions.delete(accountId);
    }
  }

  override async onDispose(): Promise<void> {
    if (rooms.get(this.presence) === this.roomId) {
      rooms.delete(this.presence);
    }
    for (const [accountId, receive] of this.subscriptions) {
      await this.presence.unsubscribe(`social:account:${accountId}`, receive);
    }
    await Promise.all(
      [...this.accountByClient].map(([connectionId, accountId]) =>
        this.service.deletePresence({ accountId, connectionId }),
      ),
    );
  }

  protected createSocialService(): SocialService {
    return new SocialService({ accounts: accountStore, presence: this.presence, resolveRoom: resolveSocialInviteRoom });
  }

  private async deliver({ accountId, event }: { accountId: string; event: SocialEvent }): Promise<void> {
    if (
      event.kind === "directMessage" &&
      !(await this.service.canInteract(
        accountId,
        event.message.senderId === accountId ? event.message.recipientId : event.message.senderId,
      ))
    ) {
      return;
    }
    if (event.kind === "presenceChanged" && !(await this.service.canInteract(accountId, event.presence.accountId))) {
      return;
    }
    const unread = ["directMessage", "messagesRead", "friendsChanged"].includes(event.kind)
      ? await this.unreadMessages(accountId)
      : undefined;
    for (const client of this.clients) {
      if (this.accountByClient.get(client.sessionId) !== accountId) {
        continue;
      }
      client.send(
        "social",
        event.kind === "presenceChanged"
          ? {
              ...event,
              presence: await this.service.visiblePresence({ viewerId: accountId, presence: event.presence }),
            }
          : event,
      );
      if (unread) {
        client.send("social", unread);
      }
      if (event.kind === "friendsChanged") {
        client.send("social", await this.service.snapshot(accountId));
      }
    }
  }

  private async unreadMessages(accountId: string): Promise<SocialEvent> {
    const conversations = await new DirectMessageStore(this.service.accounts).conversations(accountId);
    return {
      kind: "unreadMessages",
      count: conversations.reduce((total, conversation) => total + conversation.unread, 0),
      conversations,
    };
  }

  private async refreshConnections(): Promise<void> {
    for (const [connectionId, accountId] of this.accountByClient) {
      await this.service.writePresence({ accountId, connectionId, status: SocialStatus.ONLINE.value });
    }
    for (const accountId of new Set(this.accountByClient.values())) {
      await this.service.readInvites(accountId);
      await this.deliver({ accountId, event: await this.service.snapshot(accountId) });
    }
  }

  private async handleIntent(client: Client, payload: unknown): Promise<void> {
    const accountId = this.accountByClient.get(client.sessionId);
    if (!accountId || typeof payload !== "object" || payload === null) {
      return;
    }
    const intent = payload as SocialIntent;
    if (intent.kind === "directMessage" || intent.kind === "readMessages") {
      if (typeof intent.friendId !== "string" || !/^[0-9a-f-]{36}$/i.test(intent.friendId)) {
        return;
      }
      if (!this.messageLimit(accountId)) {
        client.send("social", {
          kind: "error",
          error: "rate_limited",
          requestId: intent.kind === "directMessage" ? intent.requestId : undefined,
        });
        return;
      }
      const store = new DirectMessageStore(this.service.accounts);
      if (intent.kind === "directMessage") {
        if (typeof intent.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(intent.requestId)) {
          return;
        }
        const message = await store.send({ accountId, friendId: intent.friendId, body: intent.body });
        if (!message) {
          client.send("social", { kind: "error", error: "message_unavailable", requestId: intent.requestId });
          return;
        }
        client.send("social", { kind: "messageSent", requestId: intent.requestId, message });
        for (const target of [accountId, intent.friendId]) {
          await this.service.publish({ accountId: target, event: { kind: "directMessage", message } });
        }
      } else if (this.refreshLimit(accountId)) {
        const at = await store.markRead({ accountId, friendId: intent.friendId });
        if (at !== undefined) {
          for (const target of [accountId, intent.friendId]) {
            await this.service.publish({
              accountId: target,
              event: { kind: "messagesRead", accountId, friendId: intent.friendId, at },
            });
          }
        }
      }
      return;
    }
    if (intent.kind === "refresh") {
      if (!this.refreshLimit(accountId)) {
        return;
      }
      client.send("social", await this.unreadMessages(accountId));
      client.send("social", await this.service.snapshot(accountId));
      for (const invite of await this.service.readInvites(accountId)) {
        client.send("social", { kind: "matchInvite", invite });
      }
      return;
    }
    if (!this.limit(accountId)) {
      client.send("social", { kind: "error", error: "rate_limited" });
      return;
    }
    if (
      intent.kind === "invite" &&
      typeof intent.friendId === "string" &&
      /^[0-9a-f-]{36}$/i.test(intent.friendId) &&
      typeof intent.roomCode === "string" &&
      /^[A-Z2-9]{6}$/i.test(intent.roomCode)
    ) {
      const invite = await this.service.invite({
        senderId: accountId,
        recipientId: intent.friendId,
        roomCode: intent.roomCode.toUpperCase(),
      });
      if (!invite) {
        client.send("social", { kind: "error", error: "invite_unavailable" });
      }
    }
    if (
      intent.kind === "answerInvite" &&
      typeof intent.inviteId === "string" &&
      /^[0-9a-f-]{36}$/i.test(intent.inviteId) &&
      typeof intent.accept === "boolean"
    ) {
      const invite = await this.service.answer({ accountId, inviteId: intent.inviteId, accept: intent.accept });
      if (!invite) {
        client.send("social", { kind: "inviteExpired", inviteId: intent.inviteId });
      }
    }
  }
}
