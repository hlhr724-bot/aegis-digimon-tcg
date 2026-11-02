import { useContext } from "react";
import { SocialContext } from "@/social/SocialContext";
import { useTranslation } from "@/i18n/useTranslation";

export function useFriendsDrawerLauncher() {
  const social = useContext(SocialContext);
  const { t } = useTranslation();
  const chat = social.quickChat;
  if (!chat || !social.accountId) {
    return undefined;
  }
  const unread = social.unreadMessages ?? 0;
  return {
    unread,
    expanded: chat.expanded,
    label: t(unread ? "friends.quickChat.unread" : "friends.quickChat.open", { count: unread }),
    toggle: chat.toggle,
  };
}
