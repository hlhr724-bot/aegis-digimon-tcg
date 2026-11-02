import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { ChatMessage } from "@aegis/shared";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { useTranslation } from "../../i18n";
import { getTranslatedCardName } from "@/i18n/getTranslatedCardName";
import { useCardTranslations } from "@/i18n/useCardTranslations";
import { EmoteIcon } from "./EmoteIcon";
import type { ChatEntry } from "./useMatchChat";
import "./matchChat.css";

const EMOTE_VISIBLE_MS = 3000;
const TEXT_BASE_VISIBLE_MS = 3500;
const TEXT_VISIBLE_MS_PER_CHARACTER = 45;
const TEXT_MAX_VISIBLE_MS = 8000;
const BUBBLE_GAP_PX = 8;

function visibleMs(message: ChatMessage): number {
  if (message.kind === "emote") return EMOTE_VISIBLE_MS;
  return Math.min(TEXT_MAX_VISIBLE_MS, TEXT_BASE_VISIBLE_MS + message.text.length * TEXT_VISIBLE_MS_PER_CHARACTER);
}

export function useChatMessageText(): (message: ChatMessage) => string {
  const { t } = useTranslation();
  const translations = useCardTranslations();
  return (message) => {
    if (message.kind === "emote") return t(`chat.emote.${message.emote}`);
    if (message.kind === "botLine") {
      const name = message.cardId ? getCardDefinition(message.cardId)?.nameEn : undefined;
      return t(`bot.line.${message.line}`, { card: name ? getTranslatedCardName({ name, translations }) : "" });
    }
    return message.text;
  };
}

/*
 * The opponent bar and the player dock change shape in every layout, and some layouts
 * dissolve the bar into its parent grid (`display: contents`), so the bubble is placed
 * against whichever of these has a box when it appears rather than laid out inside them.
 */
const ANCHOR_SELECTORS = {
  opponent: [".game-opponent-bar", "[data-testid='opponent-hand']"],
  player: [".game-player-dock", ".game-hand-dock"],
} as const;

function bubblePosition(board: HTMLElement, side: "player" | "opponent"): CSSProperties {
  const boardRect = board.getBoundingClientRect();
  const anchorRect = ANCHOR_SELECTORS[side]
    .map((selector) => board.querySelector(selector)?.getBoundingClientRect())
    .find((rect) => rect !== undefined && rect.height > 0);
  const left = boardRect.left + boardRect.width / 2;
  if (side === "opponent") {
    return { left, top: (anchorRect?.bottom ?? boardRect.top + boardRect.height * 0.15) + BUBBLE_GAP_PX };
  }
  const top = anchorRect?.top ?? boardRect.bottom - boardRect.height * 0.25;
  return { left, bottom: window.innerHeight - top + BUBBLE_GAP_PX };
}

/** The newest message from one side, shown for a few seconds next to that side's bar. */
export function ChatBubble({
  entry,
  side,
  senderName,
  boardRef,
}: {
  entry: ChatEntry | undefined;
  side: "player" | "opponent";
  senderName: string;
  boardRef: RefObject<HTMLElement | null>;
}) {
  const messageText = useChatMessageText();
  const [shown, setShown] = useState<{ id: number; position: CSSProperties }>();
  const entryId = entry?.id;
  const duration = entry ? visibleMs(entry.message) : 0;

  useEffect(() => {
    const board = boardRef.current;
    if (entryId === undefined || !board) {
      setShown(undefined);
      return;
    }
    setShown({ id: entryId, position: bubblePosition(board, side) });
    const timer = setTimeout(() => setShown(undefined), duration);
    return () => clearTimeout(timer);
  }, [entryId, duration, side, boardRef]);

  const visible = entry !== undefined && shown?.id === entry.id;
  return (
    <>
      <div className="aegis-sr-only" role="log" aria-live="polite">
        {visible ? `${senderName}: ${messageText(entry.message)}` : ""}
      </div>
      {visible
        ? createPortal(
            <p
              key={entry.id}
              className="match-chat-bubble"
              data-side={side}
              data-kind={entry.message.kind}
              style={shown.position}
              aria-hidden="true"
            >
              {entry.message.kind === "emote" ? (
                <EmoteIcon emote={entry.message.emote} size={24} />
              ) : (
                <span>{messageText(entry.message)}</span>
              )}
            </p>,
            document.body,
          )
        : null}
    </>
  );
}
