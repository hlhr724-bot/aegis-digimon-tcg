import { useState } from "react";
import { friendsApi } from "@/friends/friendsApi";
import { getFriendErrorKey } from "@/friends/getFriendErrorKey";
import type { TranslationKey } from "@/i18n/translationTypes";
import { useArenaInputCancel } from "@/game/input/useArenaInputCancel";
import { useEffect, useRef } from "react";
import { Switch } from "../../design/primitives";
import { useTranslation } from "../../i18n";
import { setChatSoundEnabled, useChatSoundEnabled } from "./chatSound";
import { useDismissOnOutsidePress } from "./useDismissOnOutsidePress";
import type { MatchChat } from "./useMatchChat";

/** The chat's settings, opened from the kebab button in the title bar. */
export function ChatSettingsMenu({
  chat,
  spectating,
  anchor,
  onClose,
}: {
  chat: MatchChat;
  spectating: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [blocking, setBlocking] = useState(false);
  const [blockNotice, setBlockNotice] = useState<TranslationKey>();
  async function blockOpponent() {
    if (!chat.roomId) {
      return;
    }
    setBlocking(true);
    try {
      await friendsApi.blockOpponent(chat.roomId);
      chat.setMutedOpponent(true);
      setBlockNotice("friends.blocked");
    } catch (error) {
      setBlockNotice(getFriendErrorKey(error));
    } finally {
      setBlocking(false);
    }
  }
  const menuRef = useRef<HTMLDivElement>(null);
  useArenaInputCancel({
    ref: menuRef,
    onCancel: () => {
      onClose();
      anchor?.focus();
    },
  });
  const chatSoundEnabled = useChatSoundEnabled();
  useDismissOnOutsidePress(menuRef, anchor, onClose);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  return (
    <div
      ref={menuRef}
      data-arena-surface
      className="match-chat-settings"
      role="group"
      aria-label={t("chat.settings")}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
        anchor?.focus();
      }}
    >
      {spectating ? null : (
        <Switch checked={chat.mutedOpponent} label={t("chat.mute")} onChange={chat.setMutedOpponent} />
      )}
      {spectating ? (
        <Switch checked={chat.mutedSpectators} label={t("chat.muteSpectators")} onChange={chat.setMutedSpectators} />
      ) : null}
      {!spectating && chat.roomId ? (
        <button disabled={blocking} onClick={() => void blockOpponent()}>
          {t("friends.block")}
        </button>
      ) : null}
      {blockNotice ? <span role="status">{t(blockNotice)}</span> : null}
      <Switch checked={chatSoundEnabled} label={t("chat.sound")} onChange={setChatSoundEnabled} />
    </div>
  );
}
