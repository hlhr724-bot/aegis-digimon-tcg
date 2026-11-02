import type { Friend } from "#shared/friends/Friend";
import type { SocialPresence } from "#shared/social/SocialPresence";
import type { MatchInvite } from "#shared/social/MatchInvite";

import type { DirectMessage } from "#shared/messages/DirectMessage";
import type { ConversationSummary } from "#shared/messages/ConversationSummary";

export type SocialEvent =
  | { kind: "directMessage"; message: DirectMessage }
  | { kind: "messageSent"; requestId: string; message: DirectMessage }
  | { kind: "messagesRead"; accountId: string; friendId: string; at: number }
  | { kind: "unreadMessages"; count: number; conversations: ConversationSummary[] }
  | { kind: "friendsSnapshot"; friends: (Friend & SocialPresence)[] }
  | { kind: "presenceChanged"; presence: SocialPresence }
  | { kind: "friendsChanged" }
  | { kind: "notificationsChanged" }
  | { kind: "matchInvite"; invite: MatchInvite }
  | { kind: "inviteAnswered"; inviteId: string; accepted: boolean }
  | { kind: "inviteExpired"; inviteId: string }
  | { kind: "error"; error: string; requestId?: string };

export type SocialIntent =
  | { kind: "directMessage"; friendId: string; body: string; requestId: string }
  | { kind: "readMessages"; friendId: string }
  | { kind: "invite"; friendId: string; roomCode: string }
  | { kind: "answerInvite"; inviteId: string; accept: boolean }
  | { kind: "refresh" };
