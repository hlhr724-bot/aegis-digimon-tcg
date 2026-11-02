import type { DirectMessage } from "#shared/messages/DirectMessage";

export type ConversationSummary = { friendId: string; unread: number; lastMessage: DirectMessage };
