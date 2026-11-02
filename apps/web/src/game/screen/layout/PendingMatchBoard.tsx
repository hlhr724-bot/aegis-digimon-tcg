/* The board before there is a board: reconnecting, a connection that failed, and the
   wait for a second player.

   The private host gets an invite panel beside the wait: a copyable link, the native
   share sheet where the browser offers one, and the room code as letter tiles. */

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../../../design/primitives";
import { Icons } from "../../../design/icons";
import { useTranslation } from "../../../i18n";
import { roomInviteUrl } from "../../../roomInvite";
import { WaitingOverlay } from "../../overlay";
import { BoardShell } from "./BoardShell";
import { GuestApprovalPanel } from "@/game/screen/layout/GuestApprovalPanel";
import type { GuestApprovalRequest } from "@/game/screen/model/getGuestApprovalView";

export function PendingMatchBoard({
  title,
  detail,
  spinner = true,
  actionLabel,
  roomCode,
  guestRequest,
  onAnswerGuest,
  status,
  onAction,
  onCancel,
}: {
  title: string;
  detail: string;
  /** A failure is not a wait, so it shows no spinner. */
  spinner?: boolean;
  actionLabel?: string;
  /** The code a guest joins this private room with, when there is one to share. */
  roomCode?: string;
  guestRequest?: GuestApprovalRequest;
  onAnswerGuest?: (accept: boolean) => void;
  status?: ReactNode;
  onAction?: () => void;
  /** Leaves the wait without an opponent, offered while the private host is inviting. */
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const cancellable = Boolean(roomCode || guestRequest);
  return (
    <BoardShell>
      <WaitingOverlay
        spinner={spinner}
        title={title}
        detail={detail}
        actionLabel={actionLabel}
        onAction={onAction}
        status={status}
        aside={getAside({ roomCode, guestRequest, onAnswerGuest })}
        cancelLabel={cancellable && onCancel ? t("game.cancelInvite") : undefined}
        onCancel={cancellable ? onCancel : undefined}
      />
    </BoardShell>
  );
}

type GetAsideParams = {
  roomCode?: string;
  guestRequest?: GuestApprovalRequest;
  onAnswerGuest?: (accept: boolean) => void;
};

function getAside({ roomCode, guestRequest, onAnswerGuest }: GetAsideParams) {
  if (guestRequest && onAnswerGuest) {
    return <GuestApprovalPanel guest={guestRequest} onAnswer={onAnswerGuest} />;
  }
  if (roomCode) {
    return <RoomInvitePanel roomCode={roomCode} />;
  }
  return undefined;
}

function RoomInvitePanel({ roomCode }: { roomCode: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const inviteUrl = roomInviteUrl(roomCode);
  const copy = (kind: "link" | "code", text: string) => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(kind))
      .catch(() => setCopied(null));
  };
  const canShare = typeof navigator.share === "function";
  const share = () => {
    if (!canShare) return copy("link", inviteUrl);
    void navigator.share({ title: t("game.inviteShareTitle"), url: inviteUrl }).catch(() => undefined);
  };
  return (
    <div className="room-invite">
      <h3 className="room-invite__title">{t("game.inviteTitle")}</h3>
      <Button full icon={canShare ? Icons.Upload : Icons.Link2} onClick={share}>
        {canShare ? t("game.shareLink") : copied === "link" ? t("game.inviteLinkCopied") : t("game.copyInviteLink")}
      </Button>
      <div className="room-invite__url-row">
        <span className="room-invite__url">{inviteUrl}</span>
        <button
          type="button"
          className={`room-invite__copy${copied === "link" ? " is-copied" : ""}`}
          onClick={() => copy("link", inviteUrl)}
          aria-label={t("game.copyInviteLink")}
          title={t("game.clickToCopy")}
        >
          {copied === "link" ? <Icons.Check size={16} /> : <Icons.Copy size={16} />}
        </button>
      </div>
      <span className="room-invite__label">{copied === "code" ? t("game.codeCopied") : t("game.roomCodeLabel")}</span>
      <button
        type="button"
        className="room-invite__tiles"
        onClick={() => copy("code", roomCode)}
        aria-label={`${t("game.roomCodeLabel")} ${roomCode}. ${t("game.clickToCopy")}`}
        title={t("game.clickToCopy")}
      >
        {[...roomCode].map((letter, index) => (
          <span key={index} className="room-invite__tile">
            {letter}
          </span>
        ))}
      </button>
    </div>
  );
}
