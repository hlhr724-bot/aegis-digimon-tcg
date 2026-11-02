import { isDigimonWorldAvatarId } from "@aegis/shared";
import { Avatar, Button } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";
import type { GuestApprovalRequest } from "@/game/screen/model/getGuestApprovalView";

type GuestApprovalPanelParams = {
  guest: GuestApprovalRequest;
  onAnswer: (accept: boolean) => void;
};

export function GuestApprovalPanel({ guest, onAnswer }: GuestApprovalPanelParams) {
  const { t } = useTranslation();
  return (
    <section className="room-invite guest-approval" aria-labelledby="guest-approval-title">
      <h3 id="guest-approval-title" className="room-invite__title">
        {t("game.guestApproval.requestTitle")}
      </h3>
      <div className="guest-approval__guest">
        <Avatar
          name={guest.displayName}
          avatarId={isDigimonWorldAvatarId(guest.avatarId) ? guest.avatarId : null}
          size={56}
        />
        <div className="guest-approval__identity">
          <strong className="guest-approval__name">{guest.displayName}</strong>
          {guest.connected ? null : (
            <span className="guest-approval__status">{t("game.guestApproval.guestOffline")}</span>
          )}
        </div>
      </div>
      <div className="guest-approval__actions">
        <Button variant="success" icon={Icons.Check} onClick={() => onAnswer(true)}>
          {t("game.guestApproval.accept")}
        </Button>
        <Button variant="danger" icon={Icons.X} onClick={() => onAnswer(false)}>
          {t("game.guestApproval.decline")}
        </Button>
      </div>
    </section>
  );
}
