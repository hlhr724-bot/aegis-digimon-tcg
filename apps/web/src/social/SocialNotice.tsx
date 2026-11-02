import { useContext } from "react";
import { SocialContext } from "@/social/SocialContext";
import { SuccessToast } from "@/design/SuccessToast";
import { useTranslation } from "@/i18n/useTranslation";

export function SocialNotice() {
  const social = useContext(SocialContext);
  const { t } = useTranslation();
  if (social.error) {
    return (
      <SuccessToast
        message={t(
          social.error === "message_unavailable" || social.error === "rate_limited"
            ? "friends.message.failed"
            : "friends.invite.failed",
        )}
        onDismiss={social.dismissNotice}
      />
    );
  }
  if (!social.inviteNotice) {
    return null;
  }
  if (social.inviteNotice.expired) {
    return <SuccessToast message={t("friends.invite.expired")} onDismiss={social.dismissNotice} />;
  }
  return (
    <SuccessToast
      message={t(social.inviteNotice.accepted ? "friends.invite.accepted" : "friends.invite.declined")}
      onDismiss={social.dismissNotice}
    />
  );
}
