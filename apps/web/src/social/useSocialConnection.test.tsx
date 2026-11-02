import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SocialEvent } from "@aegis/shared/protocol/social";
import { useSocialConnection } from "@/social/useSocialConnection";

const transport = vi.hoisted(() => ({
  receive: undefined as ((event: SocialEvent) => void) | undefined,
  leave: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  send: vi.fn<(channel: string, intent: unknown) => void>(),
}));
vi.mock("@/social/getSocialEndpoint", () => ({
  getSocialEndpoint: async () => ({ http: "http://localhost:2580", websocket: "ws://localhost:2580" }),
}));
vi.mock("@colyseus/sdk", () => ({
  Client: class {
    async consumeSeatReservation() {
      return {
        send: transport.send,
        leave: transport.leave,
        onMessage: (_channel: string, receive: (event: SocialEvent) => void) => {
          transport.receive = receive;
        },
        onLeave: () => {},
        onError: () => {},
        removeAllListeners: () => {},
      };
    }
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  transport.receive = undefined;
});

async function connect(accountId = "recipient") {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ roomId: "social-room" })));
  const onAccept = vi.fn<() => void>();
  const onNotifications = vi.fn<() => void>();
  const hook = renderHook(() => useSocialConnection({ accountId, onAccept, onNotifications }));
  await waitFor(() => expect(hook.result.current.connected).toBe(true));
  return { ...hook, onAccept, onNotifications };
}

const invite = {
  id: "invite",
  senderId: "sender",
  recipientId: "recipient",
  senderName: "Sender",
  roomCode: "ABCDEF",
  expiresAt: Date.now() + 60_000,
};

describe("social connection event handling", () => {
  it("opens the match only in the tab that accepted the invitation", async () => {
    const hook = await connect();
    act(() => {
      transport.receive?.({ kind: "matchInvite", invite });
      transport.receive?.({ kind: "inviteAnswered", inviteId: invite.id, accepted: true });
    });
    expect(hook.onAccept).not.toHaveBeenCalled();
    act(() => {
      transport.receive?.({ kind: "matchInvite", invite });
      hook.result.current.answer(invite.id, true);
      transport.receive?.({ kind: "inviteAnswered", inviteId: invite.id, accepted: true });
    });
    expect(hook.onAccept).toHaveBeenCalledExactlyOnceWith(invite);
    expect(hook.result.current.invites).toEqual([]);
  });

  it("notifies the sender when an invitation is declined or expires", async () => {
    const hook = await connect("sender");
    act(() => {
      transport.receive?.({ kind: "matchInvite", invite });
      transport.receive?.({ kind: "inviteAnswered", inviteId: invite.id, accepted: false });
    });
    expect(hook.result.current.inviteNotice).toEqual({ accepted: false, expired: false });
    act(() => {
      transport.receive?.({ kind: "matchInvite", invite });
      transport.receive?.({ kind: "inviteExpired", inviteId: invite.id });
    });
    expect(hook.result.current.inviteNotice).toEqual({ accepted: false, expired: true });
    act(() => hook.result.current.dismissNotice());
    expect(hook.result.current.inviteNotice).toBeUndefined();
  });

  it("refreshes notifications immediately and maintains the synchronized friend presence", async () => {
    const hook = await connect();
    act(() => {
      transport.receive?.({
        kind: "friendsSnapshot",
        friends: [
          { accountId: "sender", displayName: "Sender", avatarId: null, avatarUrl: null, since: 1, status: "online" },
        ],
      });
      transport.receive?.({ kind: "presenceChanged", presence: { accountId: "sender", status: "in_match" } });
      transport.receive?.({ kind: "notificationsChanged" });
    });
    expect(hook.onNotifications).toHaveBeenCalledOnce();
    expect(hook.result.current.friends[0]?.status).toBe("in_match");
    hook.unmount();
    expect(transport.leave).toHaveBeenCalledOnce();
  });
});

it("correlates a message acknowledgment with its originating request", async () => {
  const hook = await connect("sender");
  let requestId: string | undefined;
  act(() => {
    requestId = hook.result.current.sendMessage?.("recipient", "Hello");
  });
  expect(transport.send).toHaveBeenLastCalledWith("social", {
    kind: "directMessage",
    friendId: "recipient",
    body: "Hello",
    requestId,
  });
  act(() =>
    transport.receive?.({
      kind: "directMessage",
      message: {
        id: "other-tab",
        senderId: "sender",
        recipientId: "recipient",
        body: "Another tab",
        createdAt: 1,
        readAt: null,
      },
    }),
  );
  expect(hook.result.current.messageAcknowledgment).toBeUndefined();
  act(() => transport.receive?.({ kind: "error", error: "message_unavailable", requestId }));
  expect(hook.result.current.messageAcknowledgment).toEqual({ requestId, delivered: false });
});
