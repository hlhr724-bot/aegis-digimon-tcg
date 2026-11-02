import type { QuickChatState } from "@/messages/QuickChatState";
import type { Friend } from "@aegis/shared/friends/Friend";
import type { SocialPresence } from "@aegis/shared/social/SocialPresence";
import type { MatchInvite } from "@aegis/shared/social/MatchInvite";

import type { DirectMessage } from "@aegis/shared/messages/DirectMessage";
import type { ConversationSummary } from "@aegis/shared/messages/ConversationSummary";

export type SocialConnection = {
  quickChat?: QuickChatState;
  messages?: DirectMessage[];
  messageAcknowledgment?: { requestId: string; delivered: boolean };
  messageReceipts?: { accountId: string; friendId: string; at: number }[];
  unreadMessages?: number;
  conversations?: ConversationSummary[];
  sendMessage?: (friendId: string, body: string) => string | undefined;
  readMessages?: (friendId: string) => void;
  accountId?: string;
  connected: boolean;
  friends: (Friend & SocialPresence)[];
  invites: MatchInvite[];
  revision: number;
  error?: string;
  inviteNotice?: { accepted: boolean; expired: boolean };
  dismissNotice: () => void;
  invite: (friendId: string, roomCode: string) => void;
  answer: (inviteId: string, accept: boolean) => void;
  refresh: () => void;
  challenge?: (friend: Friend) => void;
  watch?: (friend: Friend & SocialPresence) => void;
};
