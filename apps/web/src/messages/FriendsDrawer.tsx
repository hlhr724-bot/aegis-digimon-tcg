import { useContext, useEffect, useRef, useState } from "react";
import { SocialContext } from "@/social/SocialContext";
import { DirectMessagePanel } from "@/messages/DirectMessagePanel";
import { IconButton } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { FriendsScreen } from "@/friends/FriendsScreen";
import { AddFriendDialog } from "@/friends/AddFriendDialog";
import { useTranslation } from "@/i18n/useTranslation";
import "@/messages/friendsDrawer.css";

export function FriendsDrawer() {
  const social = useContext(SocialContext);
  const chat = social.quickChat;
  const { t } = useTranslation();
  const root = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const expanded = chat?.expanded ?? false;
  useEffect(() => {
    if (expanded) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    returnFocus.current?.focus();
    returnFocus.current = null;
  }, [expanded]);
  useEffect(() => {
    if (!expanded || !chat?.showFriends) {
      return;
    }
    const frame = requestAnimationFrame(() =>
      root.current?.querySelector<HTMLInputElement>("input[type=search]")?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [expanded, chat?.showFriends]);
  if (!chat || !social.accountId) {
    return null;
  }
  return (
    <aside
      ref={root}
      data-arena-native-input
      className="quick-chat"
      hidden={!chat.expanded}
      aria-label={t("friends.quickChat")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          chat.minimize();
        }
      }}
    >
      {chat.friend ? (
        <div hidden={chat.showFriends} className="quick-chat-conversation-container">
          <DirectMessagePanel
            key={`${social.accountId}:${chat.friend.accountId}`}
            friend={chat.friend}
            embedded
            compact
            active={chat.expanded && !chat.showFriends}
            onBack={chat.showList}
            onClose={chat.minimize}
          />
        </div>
      ) : null}
      {chat.showFriends ? (
        <section className="quick-chat-directory" aria-label={t("friends.title")}>
          <header className="quick-chat-directory-header">
            <h2>{t("friends.title")}</h2>
            <IconButton label={t("friends.add")} variant="ghost" onClick={() => setAddOpen(true)}>
              <Icons.UserPlus size={18} />
            </IconButton>
            <IconButton label={t("common.close")} variant="ghost" onClick={chat.minimize}>
              <Icons.X size={18} />
            </IconButton>
          </header>
          <FriendsScreen key={social.accountId} signedIn compact onSignIn={() => {}} />
        </section>
      ) : null}
      {addOpen ? <AddFriendDialog onClose={() => setAddOpen(false)} /> : null}
    </aside>
  );
}
