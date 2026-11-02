import { useContext, useEffect, useState } from "react";
import { SocialContext } from "@/social/SocialContext";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import "@/social/social.css";
import "@/design/SuccessToast.css";

type SocialInvitesParams = { canAccept: boolean };

export function SocialInvites({ canAccept }: SocialInvitesParams) {
  const { t } = useTranslation();
  const social = useContext(SocialContext);
  const [answering, setAnswering] = useState<string>();
  const invite = social.invites[0];
  useEffect(() => {
    setAnswering(undefined);
  }, [invite?.id, social.error]);
  if (!invite) {
    return null;
  }
  return (
    <aside className="social-invite aegis-success-toast" role="status" aria-live="polite">
      <div>
        <strong>{t("friends.invite.title", { name: invite.senderName })}</strong>
        <p>{t("friends.invite.expires")}</p>
      </div>
      <div className="friends-actions">
        <Button
          size="sm"
          disabled={!canAccept || !social.connected || answering === invite.id}
          onClick={() => {
            setAnswering(invite.id);
            social.answer(invite.id, true);
          }}
        >
          {t("friends.invite.accept")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!social.connected || answering === invite.id}
          onClick={() => {
            setAnswering(invite.id);
            social.answer(invite.id, false);
          }}
        >
          {t("friends.decline")}
        </Button>
      </div>
      {!canAccept ? <small>{t("friends.invite.busy")}</small> : null}
    </aside>
  );
}
