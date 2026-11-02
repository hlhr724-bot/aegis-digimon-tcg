import { useId } from "react";
import { Button, Dialog } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import "@/friends/friends.css";

type RemoveFriendDialogParams = { displayName: string; busy: boolean; onConfirm: () => void; onClose: () => void };

export function RemoveFriendDialog({ displayName, busy, onConfirm, onClose }: RemoveFriendDialogParams) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <Dialog className="remove-friend-dialog" labelledBy={titleId} onClose={onClose}>
      <h2 id={titleId}>{t("friends.removeConfirm.title", { name: displayName })}</h2>
      <p>{t("friends.removeConfirm.body", { name: displayName })}</p>
      <div className="remove-friend-actions">
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="danger" disabled={busy} onClick={onConfirm}>
          {t("friends.remove")}
        </Button>
      </div>
    </Dialog>
  );
}
