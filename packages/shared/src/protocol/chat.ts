import type { Seat } from "../schema/enums.js";
import type { BotLine } from "../bot/BotLine.js";

export const CHAT_CHANNEL = "chat" as const;

/** The tamer commands from Digimon World (PS1), shouted at the opponent as emotes. */
export const MATCH_EMOTES = [
  "offense",
  "moderate",
  "stayAway",
  "defense",
  "changeTarget",
  "runAway",
  "praise",
  "scold",
] as const;

export type MatchEmote = (typeof MATCH_EMOTES)[number];

export const CHAT_TEXT_MAX_LENGTH = 120;

/** Minimum gap between two messages from the same sender. The server drops anything sooner. */
export const CHAT_COOLDOWN_MS = 1500;

export type ChatMessage =
  | { kind: "emote"; emote: MatchEmote }
  | { kind: "text"; text: string }
  | { kind: "botLine"; line: BotLine; text: string; cardId?: string };

/**
 * A spectator writes under the name it joined with, cleaned up by the server. A name that
 * is empty, offensive or a player's own is withheld, and clients fall back to "Spectator
 * <number>". `sessionId` lets that spectator's client recognise its own messages.
 */
export type ChatSender =
  | { kind: "player"; seat: Seat }
  | { kind: "spectator"; sessionId: string; number: number; name?: string };

export const SPECTATOR_NAME_MAX_LENGTH = 24;

export interface ChatBroadcast {
  sender: ChatSender;
  message: ChatMessage;
}

/** Control characters and the bidirectional overrides that could reorder other UI text. */
const UNSAFE_CHARACTERS = new RegExp("[\\p{Cc}\\u202A-\\u202E\\u2066-\\u2069]", "gu");

/**
 * Collapses whitespace, strips control and bidirectional-override characters, and caps
 * the length in code points. Returns "" when nothing is left. Zero-width joiners stay so
 * composed emoji survive.
 */
export function normalizeChatText(text: string): string {
  return Array.from(text.replace(UNSAFE_CHARACTERS, " ").replace(/\s+/g, " ").trim())
    .slice(0, CHAT_TEXT_MAX_LENGTH)
    .join("")
    .trim();
}

export function parseChatMessage(payload: unknown): ChatMessage | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  const value = payload as Record<string, unknown>;
  if (value.kind === "emote") {
    return MATCH_EMOTES.includes(value.emote as MatchEmote)
      ? { kind: "emote", emote: value.emote as MatchEmote }
      : undefined;
  }
  if (value.kind === "text" && typeof value.text === "string" && value.text.length <= CHAT_TEXT_MAX_LENGTH * 4) {
    const text = normalizeChatText(value.text);
    return text ? { kind: "text", text } : undefined;
  }
  return;
}
