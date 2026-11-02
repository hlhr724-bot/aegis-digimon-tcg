import { useContext, useId } from "react";
import type { Friend } from "@aegis/shared/friends/Friend";
import type { ConversationSummary } from "@aegis/shared/messages/ConversationSummary";
import { SocialContext } from "@/social/SocialContext";
import { FriendActionsMenu } from "@/friends/FriendActionsMenu";
import { Avatar, IconButton } from "@/design/primitives";
import { Icons } from "@/design/icons";
import { useTranslation } from "@/i18n/useTranslation";

type FriendConversationRowParams = {
  friend: Friend;
  summary?: ConversationSummary;
  busy: boolean;
  selected: boolean;
  onOpen: (friend: Friend) => void;
  onAction: (action: () => Promise<unknown>) => Promise<void>;
};

export function FriendConversationRow({
  friend,
  summary,
  busy,
  selected,
  onOpen,
  onAction,
}: FriendConversationRowParams) {
  const { t } = useTranslation();
  const social = useContext(SocialContext);
  const detailId = useId();
  const presence = social.friends.find((entry) => entry.accountId === friend.accountId);
  const status = presence?.status ?? null;
  const lastMessage = summary?.lastMessage;
  const preview = lastMessage
    ? `${lastMessage.senderId === social.accountId ? `${t("friends.message.you")}: ` : ""}${lastMessage.body}`
    : undefined;
  const unread = summary?.unread ?? 0;
  return (
    <li className="friend-conversation" data-selected={selected || undefined} data-unread={unread > 0 || undefined}>
      <button
        className="friend-conversation-open"
        aria-label={t("friends.message.title", { name: friend.displayName })}
        aria-describedby={detailId}
        onClick={() => onOpen(friend)}
      >
        <span className="friend-conversation-avatar">
          <Avatar
            name={friend.displayName}
            avatarId={friend.avatarId ?? undefined}
            avatarUrl={friend.avatarUrl ?? undefined}
            size={40}
          />
          <span className="friend-conversation-presence" data-status={status ?? "offline"} aria-hidden="true" />
        </span>
        <span className="friend-conversation-text">
          <strong>{friend.displayName}</strong>
          <small id={detailId}>
            {t(`friends.status.${status ?? "offline"}`)}
            {preview ? ` · ${preview}` : ""}
            {unread ? (
              <span className="aegis-sr-only">, {t("friends.message.unreadCount", { count: unread })}</span>
            ) : null}
          </small>
        </span>
        {unread ? (
          <span className="friend-conversation-unread" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {presence?.roomCode && social.watch ? (
        <IconButton
          className="friend-conversation-watch"
          label={t("friends.watch")}
          variant="ghost"
          disabled={busy || !social.connected}
          onClick={() => social.watch?.(presence)}
        >
          <Icons.Eye size={18} />
        </IconButton>
      ) : null}
      <FriendActionsMenu
        accountId={friend.accountId}
        displayName={friend.displayName}
        canRemove
        busy={busy}
        onAction={onAction}
        onChallenge={social.challenge ? () => social.challenge?.(friend) : undefined}
        challengeDisabled={!social.connected || !status}
      />
    </li>
  );
}
