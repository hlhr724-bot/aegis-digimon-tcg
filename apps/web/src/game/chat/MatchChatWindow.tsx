import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CHAT_TEXT_MAX_LENGTH, normalizeChatText, type MatchEmote, type Seat } from "@aegis/shared";
import { Icons } from "../../design/icons";
import { useTranslation } from "../../i18n";
import { useChatMessageText } from "./ChatBubble";
import { ChatSettingsMenu } from "./ChatSettingsMenu";
import { EmoteIcon } from "./EmoteIcon";
import { EmotePicker } from "./EmotePicker";
import { useDraggableWindow } from "./useDraggableWindow";
import type { ChatEntry, MatchChat } from "./useMatchChat";

/**
 * The chat window: docked on the right, draggable by its title bar, with the history, a
 * text box, the emote pop-up, and the mute switches. Portalled to the body so a transformed
 * board ancestor cannot re-anchor `position: fixed`, and so it stacks above the bubbles.
 */
export function MatchChatWindow({
  chat,
  spectating,
  seatNames,
  onClose,
}: {
  chat: MatchChat;
  spectating: boolean;
  seatNames: Record<Seat, string>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const messageText = useChatMessageText();
  const senderName = ({ own, sender }: ChatEntry) => {
    if (own) return t("chat.you");
    if (sender.kind === "player") return seatNames[sender.seat];
    return sender.name ?? t("chat.spectator", { number: sender.number });
  };
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const windowRef = useRef<HTMLElement>(null);
  const historyRef = useRef<HTMLOListElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const { position, handleProps, keepOnScreen } = useDraggableWindow(windowRef);

  // Growing in place can push a dragged window past the viewport's edge.
  useLayoutEffect(keepOnScreen, [expanded, keepOnScreen]);
  const { send, coolingDown } = chat;
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => {
    const history = historyRef.current;
    if (history) history.scrollTop = history.scrollHeight;
  }, [chat.entries]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = normalizeChatText(draft);
    if (!send || coolingDown || !text) return;
    send({ kind: "text", text });
    setDraft("");
  };

  const pickEmote = (emote: MatchEmote) => {
    send?.({ kind: "emote", emote });
    setPickerOpen(false);
    pickerButtonRef.current?.focus();
  };

  return createPortal(
    <section
      data-arena-surface
      ref={windowRef}
      className="match-chat-window"
      data-moved={position ? true : undefined}
      data-expanded={expanded || undefined}
      style={position ? { left: position.left, top: position.top } : undefined}
      aria-label={t(spectating ? "chat.titleSpectators" : "chat.title")}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="match-chat-window__title" {...handleProps}>
        <Icons.MessageSquare size={14} aria-hidden="true" />
        <h2>{t(spectating ? "chat.titleSpectators" : "chat.title")}</h2>
        <button
          ref={settingsButtonRef}
          type="button"
          className="match-chat-window__control"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-label={t("chat.settings")}
          aria-expanded={settingsOpen}
          title={t("chat.settings")}
        >
          <Icons.MoreVertical size={16} />
        </button>
        <button
          type="button"
          className="match-chat-window__control"
          onClick={() => setExpanded((current) => !current)}
          aria-label={t("chat.expand")}
          aria-pressed={expanded}
          title={t("chat.expand")}
        >
          {expanded ? <Icons.Minimize size={15} /> : <Icons.Maximize size={15} />}
        </button>
        <button
          type="button"
          className="match-chat-window__control"
          data-arena-cancel
          onClick={onClose}
          aria-label={t("chat.close")}
        >
          <Icons.X size={16} />
        </button>
      </header>
      {settingsOpen ? (
        <ChatSettingsMenu
          chat={chat}
          spectating={spectating}
          anchor={settingsButtonRef.current}
          onClose={closeSettings}
        />
      ) : null}
      <div className="match-chat-window__body">
        <ol className="match-chat-window__history" ref={historyRef}>
          {chat.entries.length === 0 ? <li className="match-chat-window__empty">{t("chat.empty")}</li> : null}
          {chat.entries.map((entry) => (
            <li
              key={entry.id}
              data-own={entry.own || undefined}
              data-sender={entry.sender.kind}
              data-kind={entry.message.kind}
            >
              <strong>{senderName(entry)}</strong>
              {/* Spectators pick their own names, so the tag keeps them from passing as a player. */}
              {entry.sender.kind === "spectator" && entry.sender.name ? (
                <small className="match-chat-window__tag">{t("chat.spectatorTag")}</small>
              ) : null}
              {entry.message.kind === "emote" ? (
                <span role="img" aria-label={messageText(entry.message)} title={messageText(entry.message)}>
                  <EmoteIcon emote={entry.message.emote} size={24} />
                </span>
              ) : (
                <span>{messageText(entry.message)}</span>
              )}
            </li>
          ))}
        </ol>
        {send ? (
          <>
            <form className="match-chat-window__compose" onSubmit={submit}>
              {pickerOpen ? (
                <EmotePicker
                  disabled={coolingDown}
                  anchor={pickerButtonRef.current}
                  onPick={pickEmote}
                  onClose={closePicker}
                />
              ) : null}
              <button
                ref={pickerButtonRef}
                type="button"
                className="match-chat-window__picker-button"
                aria-label={t("chat.emotes")}
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen((open) => !open)}
              >
                <EmoteIcon emote="praise" size={16} />
              </button>
              <input
                value={draft}
                maxLength={CHAT_TEXT_MAX_LENGTH}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t(spectating ? "chat.placeholderSpectator" : "chat.placeholder")}
                aria-label={t(spectating ? "chat.placeholderSpectator" : "chat.placeholder")}
                autoComplete="off"
                enterKeyHint="send"
              />
              <button
                type="submit"
                className="match-chat-window__send"
                disabled={coolingDown || !normalizeChatText(draft)}
                aria-label={t("chat.send")}
              >
                <Icons.Send size={16} />
              </button>
            </form>
          </>
        ) : null}
      </div>
    </section>,
    document.body,
  );
}
