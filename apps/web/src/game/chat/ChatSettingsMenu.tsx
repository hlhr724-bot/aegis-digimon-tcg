import { useState } from "react";
import { friendsApi } from "@/friends/friendsApi";
import { getFriendErrorKey } from "@/friends/getFriendErrorKey";
import type { TranslationKey } from "@/i18n/translationTypes";
import { useArenaInputCancel } from "@/game/input/useArenaInputCancel";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Switch } from "../../design/primitives";
import { useTranslation } from "../../i18n";
import { setChatSoundEnabled, useChatSoundEnabled } from "./chatSound";
import { useDismissOnOutsidePress } from "./useDismissOnOutsidePress";
import type { MatchChat } from "./useMatchChat";
import { ChatReportStatus } from "@aegis/shared/chat/ChatReportStatus";
import { getBrowserTranslationApi } from "@/game/chat/translation/getBrowserTranslationApi";
import { useChatAutoTranslate } from "@/game/chat/translation/useChatAutoTranslate";

const REPORT_NOTICE_BY_STATUS: Partial<Record<ChatReportStatus, TranslationKey>> = {
  [ChatReportStatus.REPORTED.value]: "chat.reported",
  [ChatReportStatus.FAILED.value]: "chat.reportFailed",
};

type MenuPlacement = "start" | "end" | "inside";

const WINDOW_GAP_PIXELS = 8;

function placementBesideWindow(menu: HTMLElement): MenuPlacement {
  const chatWindow = menu.parentElement?.getBoundingClientRect();
  const room = menu.offsetWidth + WINDOW_GAP_PIXELS * 2;
  if (!chatWindow) {
    return "inside";
  }
  if (chatWindow.left >= room) {
    return "start";
  }
  return window.innerWidth - chatWindow.right >= room ? "end" : "inside";
}

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
  const [placement, setPlacement] = useState<MenuPlacement>("inside");
  useLayoutEffect(() => {
    const place = () => {
      if (menuRef.current) {
        setPlacement(placementBesideWindow(menuRef.current));
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);
  useArenaInputCancel({
    ref: menuRef,
    onCancel: () => {
      onClose();
      anchor?.focus();
    },
  });
  const chatSoundEnabled = useChatSoundEnabled();
  const [autoTranslate, setAutoTranslate] = useChatAutoTranslate();
  const reportNotice = chat.reportStatus ? REPORT_NOTICE_BY_STATUS[chat.reportStatus] : undefined;
  useDismissOnOutsidePress(menuRef, anchor, onClose);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  return (
    <div
      ref={menuRef}
      data-arena-surface
      className="match-chat-settings"
      data-placement={placement}
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
      {!spectating && chat.reportOpponent ? (
        <button disabled={chat.reportStatus === ChatReportStatus.REPORTED.value} onClick={chat.reportOpponent}>
          {t("chat.report")}
        </button>
      ) : null}
      {!spectating && reportNotice ? <span role="status">{t(reportNotice)}</span> : null}
      <Switch checked={chatSoundEnabled} label={t("chat.sound")} onChange={setChatSoundEnabled} />
      {getBrowserTranslationApi() ? (
        <Switch checked={autoTranslate} label={t("chat.autoTranslate")} onChange={setAutoTranslate} />
      ) : null}
    </div>
  );
}
