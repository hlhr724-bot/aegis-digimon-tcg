import { useArenaInputCancel } from "@/game/input/useArenaInputCancel";
import { useEffect, useRef } from "react";
import { MATCH_EMOTES, type MatchEmote } from "@aegis/shared";
import { useTranslation } from "../../i18n";
import { EmoteIcon } from "./EmoteIcon";
import { useDismissOnOutsidePress } from "./useDismissOnOutsidePress";

/** The pop-up menu of tamer-command icons, opened from the smiley button beside the text box. */
export function EmotePicker({
  disabled,
  anchor,
  onPick,
  onClose,
}: {
  disabled: boolean;
  /** The button that opened the menu; pressing it toggles rather than counts as outside. */
  anchor: HTMLElement | null;
  onPick: (emote: MatchEmote) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  useArenaInputCancel({
    ref: menuRef,
    onCancel: () => {
      onClose();
      anchor?.focus();
    },
  });

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, []);

  useDismissOnOutsidePress(menuRef, anchor, onClose);

  return (
    <div
      ref={menuRef}
      data-arena-surface
      className="match-chat-picker"
      role="group"
      aria-label={t("chat.emotes")}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
        anchor?.focus();
      }}
    >
      {MATCH_EMOTES.map((emote) => (
        <button
          key={emote}
          type="button"
          disabled={disabled}
          aria-label={t(`chat.emote.${emote}`)}
          title={t(`chat.emote.${emote}`)}
          onClick={() => onPick(emote)}
        >
          <EmoteIcon emote={emote} size={24} />
        </button>
      ))}
    </div>
  );
}
