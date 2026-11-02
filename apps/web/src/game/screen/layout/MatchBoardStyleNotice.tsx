import { useEffect, useState } from "react";
import { Icons } from "@/design/icons";
import { BoardStyle } from "@/game/arena3d/boardStyle/BoardStyle";
import { boardStylePreference } from "@/game/arena3d/boardStyle/boardStylePreference";
import { isWebGlAvailable } from "@/game/arena3d/isWebGlAvailable";
import { useTranslation } from "@/i18n/useTranslation";
import "./matchBoardStyleNotice.css";

const SEEN_KEY = "aegis.board-style-notice-seen";

let shownThisPage = false;

function hasSeenNotice(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markNoticeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    return;
  }
}

function shouldShowNotice(): boolean {
  if (shownThisPage) {
    return true;
  }
  return boardStylePreference.getStyle() !== BoardStyle.ARENA_3D.value && !hasSeenNotice() && isWebGlAvailable();
}

export function MatchBoardStyleNotice() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(shouldShowNotice);

  useEffect(() => {
    if (visible) {
      shownThisPage = true;
      markNoticeSeen();
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  function close() {
    shownThisPage = false;
    setVisible(false);
  }

  function turnOnArena() {
    boardStylePreference.setStyle(BoardStyle.ARENA_3D.value);
    close();
  }

  return (
    <aside className="match-board-style-notice" role="status">
      <p className="match-board-style-notice__text">
        <strong>{t("game.boardStyleNotice.tag")}</strong>
        <span>{t("game.boardStyleNotice.message")}</span>
      </p>
      <button type="button" className="match-board-style-notice__action" onClick={turnOnArena}>
        {t("game.boardStyleNotice.action")}
      </button>
      <button
        type="button"
        className="match-board-style-notice__dismiss"
        onClick={close}
        aria-label={t("game.boardStyleNotice.dismissAria")}
        title={t("game.boardStyleNotice.dismissAria")}
      >
        <Icons.X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
