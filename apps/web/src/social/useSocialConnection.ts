import { useCallback, useEffect, useRef, useState } from "react";
import { Client, type Room } from "@colyseus/sdk";
import type { SocialEvent, SocialIntent } from "@aegis/shared/protocol/social";
import type { SocialConnection } from "@/social/SocialConnection";
import type { MatchInvite } from "@aegis/shared/social/MatchInvite";
import { getSocialEndpoint } from "@/social/getSocialEndpoint";

type UseSocialConnectionParams = {
  accountId?: string;
  onNotifications: () => void;
  onAccept: (invite: MatchInvite) => void;
};

export function useSocialConnection({
  accountId,
  onNotifications,
  onAccept,
}: UseSocialConnectionParams): SocialConnection {
  const [messageAcknowledgment, setMessageAcknowledgment] = useState<SocialConnection["messageAcknowledgment"]>();
  const [messageReceipts, setMessageReceipts] = useState<NonNullable<SocialConnection["messageReceipts"]>>([]);
  const [messages, setMessages] = useState<NonNullable<SocialConnection["messages"]>>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [conversations, setConversations] = useState<NonNullable<SocialConnection["conversations"]>>([]);
  const [connected, setConnected] = useState(false);
  const [friends, setFriends] = useState<SocialConnection["friends"]>([]);
  const [invites, setInvites] = useState<MatchInvite[]>([]);
  const [revision, setRevision] = useState(0);
  const [inviteNotice, setInviteNotice] = useState<SocialConnection["inviteNotice"]>();
  const acceptedHere = useRef(new Set<string>());
  const [error, setError] = useState<string>();
  const roomRef = useRef<Room | undefined>(undefined);
  const callbacks = useRef({ onNotifications, onAccept });
  callbacks.current = { onNotifications, onAccept };
  const pending = useRef(new Map<string, MatchInvite>());

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let prune: ReturnType<typeof setInterval> | undefined;
    let attempts = 0;
    setMessageAcknowledgment(undefined);
    setMessageReceipts([]);
    setMessages([]);
    setUnreadMessages(0);
    setFriends([]);
    setInvites([]);
    setConnected(false);
    pending.current.clear();
    acceptedHere.current.clear();
    if (!accountId) {
      return;
    }
    function scheduleReconnect() {
      if (stopped) {
        return;
      }
      setConnected(false);
      const oldRoom = roomRef.current;
      roomRef.current = undefined;
      oldRoom?.removeAllListeners();
      void oldRoom?.leave().catch(() => undefined);
      clearTimeout(retry);
      retry = setTimeout(() => void connect(), Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)));
    }
    function receive(event: SocialEvent) {
      if (stopped) {
        return;
      }
      if (event.kind === "messageSent") {
        setMessageAcknowledgment({ requestId: event.requestId, delivered: true });
      }
      if (event.kind === "directMessage" || event.kind === "messageSent") {
        setMessages((current) =>
          [...current.filter((message) => message.id !== event.message.id), event.message].slice(-200),
        );
      }
      if (event.kind === "messagesRead") {
        setMessageReceipts((current) =>
          [
            ...current.filter(
              (receipt) => receipt.accountId !== event.accountId || receipt.friendId !== event.friendId,
            ),
            event,
          ].slice(-400),
        );
        setMessages((current) =>
          current.map((message) =>
            message.recipientId === event.accountId &&
            message.senderId === event.friendId &&
            message.createdAt <= event.at
              ? { ...message, readAt: event.at }
              : message,
          ),
        );
      }
      if (event.kind === "unreadMessages") {
        setUnreadMessages(event.count);
        setConversations(event.conversations);
      }
      if (event.kind === "friendsSnapshot") {
        setFriends(event.friends);
      }
      if (event.kind === "presenceChanged") {
        setFriends((current) =>
          current.map((friend) =>
            friend.accountId === event.presence.accountId ? { ...friend, ...event.presence } : friend,
          ),
        );
      }
      if (event.kind === "friendsChanged") {
        setRevision((value) => value + 1);
      }
      if (event.kind === "notificationsChanged") {
        callbacks.current.onNotifications();
      }
      if (event.kind === "matchInvite") {
        pending.current.set(event.invite.id, event.invite);
        if (event.invite.recipientId === accountId) {
          setInvites((current) => [...current.filter((invite) => invite.id !== event.invite.id), event.invite]);
        }
      }
      if (event.kind === "inviteAnswered" || event.kind === "inviteExpired") {
        const invite = pending.current.get(event.inviteId);
        if (
          event.kind === "inviteAnswered" &&
          event.accepted &&
          invite &&
          invite.recipientId === accountId &&
          acceptedHere.current.has(event.inviteId)
        ) {
          callbacks.current.onAccept(invite);
        }
        if (invite?.senderId === accountId) {
          setInviteNotice({
            accepted: event.kind === "inviteAnswered" && event.accepted,
            expired: event.kind === "inviteExpired",
          });
        }
        acceptedHere.current.delete(event.inviteId);
        pending.current.delete(event.inviteId);
        setInvites((current) => current.filter((entry) => entry.id !== event.inviteId));
      }
      if (event.kind === "error") {
        if (event.requestId) {
          setMessageAcknowledgment({ requestId: event.requestId, delivered: false });
        }
        setError(event.error);
      }
    }
    async function connect() {
      try {
        const endpoint = await getSocialEndpoint();
        const response = await fetch(`${endpoint.http}/social/join`, {
          method: "POST",
          credentials: "include",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          if (response.status === 401) {
            setError("authentication_required");
            return;
          }
          throw new Error("social_unavailable");
        }
        const reservation = (await response.json()) as Parameters<Client["consumeSeatReservation"]>[0];
        if (stopped) {
          return;
        }
        const room = await new Client(endpoint.websocket).consumeSeatReservation(reservation);
        if (stopped) {
          await room.leave();
          return;
        }
        roomRef.current = room;
        room.onMessage("social", receive);
        room.onLeave(scheduleReconnect);
        room.onError(scheduleReconnect);
        attempts = 0;
        setError(undefined);
        setConnected(true);
        room.send("social", { kind: "refresh" });
      } catch {
        scheduleReconnect();
      }
    }
    void connect();
    prune = setInterval(() => {
      setInvites((current) => current.filter((invite) => invite.expiresAt > Date.now()));
      for (const [id, invite] of pending.current) {
        if (invite.expiresAt <= Date.now()) {
          if (invite.senderId === accountId) {
            setInviteNotice({ accepted: false, expired: true });
          }
          pending.current.delete(id);
          acceptedHere.current.delete(id);
        }
      }
    }, 1000);
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(prune);
      const room = roomRef.current;
      roomRef.current = undefined;
      void room?.leave().catch(() => undefined);
    };
  }, [accountId]);

  const send = useCallback((intent: SocialIntent) => {
    if (!roomRef.current) {
      setError("disconnected");
      return;
    }
    setError(undefined);
    roomRef.current.send("social", intent);
  }, []);
  const invite = useCallback(
    (friendId: string, roomCode: string) => send({ kind: "invite", friendId, roomCode }),
    [send],
  );
  const answer = useCallback(
    (inviteId: string, accept: boolean) => {
      if (accept) {
        acceptedHere.current.add(inviteId);
      }
      send({ kind: "answerInvite", inviteId, accept });
    },
    [send],
  );
  const refresh = useCallback(() => send({ kind: "refresh" }), [send]);
  const dismissNotice = useCallback(() => {
    setInviteNotice(undefined);
    setError(undefined);
  }, []);
  return {
    messages,
    messageAcknowledgment,
    messageReceipts,
    unreadMessages,
    conversations,
    sendMessage: (friendId, body) => {
      if (!roomRef.current) {
        setError("disconnected");
        return undefined;
      }
      const requestId = crypto.randomUUID();
      send({ kind: "directMessage", friendId, body, requestId });
      return requestId;
    },
    readMessages: (friendId) => send({ kind: "readMessages", friendId }),
    accountId,
    connected,
    friends,
    invites,
    revision,
    error,
    invite,
    answer,
    refresh,
    inviteNotice,
    dismissNotice,
  };
}
