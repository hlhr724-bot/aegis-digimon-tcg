import type { SocialPresence } from "@aegis/shared/social/SocialPresence";
import { useTranslation } from "@/i18n/useTranslation";
import "@/social/social.css";

export function FriendPresence({ status }: Pick<SocialPresence, "status">) {
  const { t } = useTranslation();
  return (
    <span className="friend-presence" data-online={status !== null} data-status={status ?? undefined}>
      <span aria-hidden="true" />
      {t(`friends.status.${status ?? "offline"}`)}
    </span>
  );
}
