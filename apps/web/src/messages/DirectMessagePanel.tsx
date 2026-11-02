import { Fragment, useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Friend } from "@aegis/shared/friends/Friend";
import type { DirectMessage } from "@aegis/shared/messages/DirectMessage";
import { CHAT_COOLDOWN_MS, CHAT_TEXT_MAX_LENGTH } from "@aegis/shared/protocol/chat";
import { SocialContext } from "@/social/SocialContext";
import { request } from "@/account/client";
import { FriendPresence } from "@/social/FriendPresence";
import { Icons } from "@/design/icons";
import { FriendDetailPanel } from "@/friends/FriendDetailPanel";
import { Button, Dialog, Avatar, IconButton, Field, Alert } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import "@/messages/directMessages.css";

const MESSAGE_GROUP_WINDOW_MS = 5 * 60_000;

type DirectMessagePanelParams = {
  friend: Friend;
  embedded?: boolean;
  compact?: boolean;
  active?: boolean;
  onMinimize?: () => void;
  onBack?: () => void;
  onClose: () => void;
};
export function DirectMessagePanel({
  friend,
  onClose,
  embedded = false,
  compact = false,
  active = true,
  onMinimize,
  onBack,
}: DirectMessagePanelParams) {
  const social = useContext(SocialContext);
  const { t, locale } = useTranslation();
  const titleId = useId();
  const [detailOpen, setDetailOpen] = useState(false);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reported, setReported] = useState<string[]>([]);
  const [pendingId, setPendingId] = useState<string>();
  const pending = pendingId !== undefined;
  const [cooldown, setCooldown] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const history = useRef<HTMLOListElement>(null);
  const scrollToLatest = useRef(true);
  const readRef = useRef(social.readMessages);
  readRef.current = social.readMessages;
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void request<{ messages: DirectMessage[] }>(`/messages/${encodeURIComponent(friend.accountId)}`)
      .then((page) => {
        if (mounted) {
          setMessages((current) =>
            [...new Map([...page.messages, ...current].map((message) => [message.id, message])).values()].sort(
              (a, b) => a.createdAt - b.createdAt,
            ),
          );
          setHasOlder(page.messages.length === 50);
          if (activeRef.current) {
            readRef.current?.(friend.accountId);
          }
        }
      })
      .catch(() => {
        if (mounted) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [friend.accountId]);
  useEffect(() => {
    const incoming = (social.messages ?? []).filter(
      (message) => message.senderId === friend.accountId || message.recipientId === friend.accountId,
    );
    if (!incoming.length) {
      return;
    }
    setMessages((current) =>
      [...new Map([...current, ...incoming].map((message) => [message.id, message])).values()].sort(
        (a, b) => a.createdAt - b.createdAt,
      ),
    );
    if (active && incoming.some((message) => message.recipientId === social.accountId && message.readAt === null)) {
      readRef.current?.(friend.accountId);
    }
  }, [social.messages, social.accountId, friend.accountId, active]);
  useEffect(() => {
    setMessages((current) =>
      current.map((message) => {
        const receipt = social.messageReceipts?.find(
          (entry) =>
            entry.accountId === message.recipientId &&
            entry.friendId === message.senderId &&
            message.createdAt <= entry.at,
        );
        return receipt ? { ...message, readAt: receipt.at } : message;
      }),
    );
  }, [social.messageReceipts, messages.length]);
  useEffect(() => {
    if (history.current && scrollToLatest.current) {
      history.current.scrollTop = history.current.scrollHeight;
    }
    scrollToLatest.current = true;
  }, [messages.length]);
  useEffect(() => {
    if (!cooldown) {
      return;
    }
    const timer = setTimeout(() => setCooldown(false), CHAT_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    if (pendingId && social.messageAcknowledgment?.requestId === pendingId) {
      if (social.messageAcknowledgment.delivered) {
        setBody("");
      }
      setPendingId(undefined);
    }
  }, [pendingId, social.messageAcknowledgment]);
  useEffect(() => {
    if (social.error) {
      setPendingId(undefined);
    }
  }, [social.error]);
  useEffect(() => {
    if (!pending) {
      return;
    }
    const timer = setTimeout(() => {
      setPendingId(undefined);
      setFailed(true);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [pending]);
  async function loadOlder() {
    setLoading(true);
    try {
      const page = await request<{ messages: DirectMessage[] }>(
        `/messages/${encodeURIComponent(friend.accountId)}?before=${messages[0]?.createdAt ?? Date.now()}`,
      );
      scrollToLatest.current = false;
      setMessages((current) => [...page.messages, ...current]);
      setHasOlder(page.messages.length === 50);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }
  function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || cooldown || !social.connected) {
      return;
    }
    setFailed(false);
    setPendingId(social.sendMessage?.(friend.accountId, body));
    setCooldown(true);
  }
  async function reportMessage(id: string) {
    try {
      await request(`/messages/${encodeURIComponent(id)}/report`, { method: "POST" });
      setReported((current) => [...current, id]);
    } catch {
      setFailed(true);
    }
  }
  useEffect(() => {
    if (active) {
      readRef.current?.(friend.accountId);
    } else {
      setDetailOpen(false);
    }
  }, [active, friend.accountId]);
  useEffect(() => {
    if (!active || !compact) {
      return;
    }
    const frame = requestAnimationFrame(() =>
      document.getElementById(`${titleId}-body`)?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [active, compact, titleId]);
  const presence = social.friends.find((entry) => entry.accountId === friend.accountId);
  const unavailable = social.connected && !presence;
  const canWatch = Boolean(presence?.roomCode && social.watch);
  const content = (
    <section className="direct-messages" aria-labelledby={titleId}>
      <header className="direct-messages-header">
        {compact && onBack ? (
          <IconButton label={t("friends.quickChat.back")} variant="ghost" onClick={onBack}>
            <Icons.ArrowLeft size={18} />
          </IconButton>
        ) : null}
        <Avatar
          name={friend.displayName}
          avatarId={friend.avatarId ?? undefined}
          avatarUrl={friend.avatarUrl ?? undefined}
          size={compact ? 32 : 40}
        />
        <div className="direct-messages-person">
          {compact ? (
            <h2 id={titleId} aria-label={friend.displayName}>
              <button
                className="quick-chat-profile"
                aria-label={t("friends.detail")}
                onClick={() => setDetailOpen(true)}
              >
                <span>{friend.displayName}</span>
                <FriendPresence status={presence?.status ?? null} />
              </button>
            </h2>
          ) : (
            <>
              <h2 id={titleId}>{t("friends.message.title", { name: friend.displayName })}</h2>
              <FriendPresence status={presence?.status ?? null} />
            </>
          )}
        </div>
        {compact && presence && canWatch ? (
          <IconButton
            label={t("friends.watch")}
            variant="ghost"
            disabled={!social.connected}
            onClick={() => social.watch?.(presence)}
          >
            <Icons.Eye size={18} />
          </IconButton>
        ) : null}
        {compact && presence && !canWatch && social.challenge ? (
          <IconButton
            label={t("friends.challenge")}
            variant="ghost"
            disabled={!social.connected || !presence.status}
            onClick={() => social.challenge?.(friend)}
          >
            <Icons.Swords size={18} />
          </IconButton>
        ) : null}
        {compact ? null : (
          <IconButton label={t("friends.detail")} variant="ghost" onClick={() => setDetailOpen(true)}>
            <Icons.User size={20} />
          </IconButton>
        )}
        {onMinimize ? (
          <IconButton label={t("friends.quickChat.minimize")} variant="ghost" onClick={onMinimize}>
            <Icons.ChevronDown size={18} />
          </IconButton>
        ) : null}
        <IconButton label={t("common.close")} variant="ghost" onClick={onClose}>
          <Icons.X size={20} />
        </IconButton>
      </header>
      {detailOpen ? <FriendDetailPanel accountId={friend.accountId} onClose={() => setDetailOpen(false)} /> : null}
      {failed || social.error ? <Alert tone="danger">{t("friends.message.failed")}</Alert> : null}
      {unavailable ? <Alert tone="warning">{t("friends.message.unavailable")}</Alert> : null}
      <ol ref={history} className="direct-messages-list" aria-label={t("friends.message.history")} aria-live="polite">
        {hasOlder ? (
          <li className="direct-messages-older">
            <Button size="sm" variant="ghost" disabled={loading} onClick={() => void loadOlder()}>
              {t("friends.message.older")}
            </Button>
          </li>
        ) : null}
        <li className="direct-messages-retention">{t("friends.message.retention")}</li>
        {loading ? (
          <li className="direct-messages-status" role="status">
            {t("common.loading")}
          </li>
        ) : null}
        {!loading && !messages.length ? <li className="direct-message-empty">{t("friends.message.empty")}</li> : null}
        {messages.map((message, index) => {
          const own = message.senderId === social.accountId;
          const previous = messages[index - 1];
          const sentAt = new Date(message.createdAt);
          const startsDay = !previous || new Date(previous.createdAt).toDateString() !== sentAt.toDateString();
          const continued =
            !startsDay &&
            previous?.senderId === message.senderId &&
            message.createdAt - previous.createdAt < MESSAGE_GROUP_WINDOW_MS;
          return (
            <Fragment key={message.id}>
              {startsDay ? (
                <li className="direct-message-day">
                  <time dateTime={sentAt.toISOString().slice(0, 10)}>
                    {sentAt.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
                  </time>
                </li>
              ) : null}
              <li className={own ? "direct-message-own" : undefined} data-continued={continued || undefined}>
                {compact || continued ? null : <strong>{own ? t("friends.message.you") : friend.displayName}</strong>}
                <p>{message.body}</p>
                <div className="direct-message-meta">
                  <time dateTime={sentAt.toISOString()}>
                    {sentAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                  </time>
                  {own ? (
                    <small data-read={message.readAt ? true : undefined}>
                      {t(message.readAt ? "friends.message.read" : "friends.message.sent")}
                    </small>
                  ) : (
                    <IconButton
                      className="direct-message-report"
                      label={t(reported.includes(message.id) ? "friends.message.reported" : "friends.message.report")}
                      size="sm"
                      variant="ghost"
                      disabled={reported.includes(message.id)}
                      onClick={() => void reportMessage(message.id)}
                    >
                      <Icons.Flag size={14} />
                    </IconButton>
                  )}
                </div>
              </li>
            </Fragment>
          );
        })}
      </ol>
      <form onSubmit={sendMessage}>
        <Field
          label={t("friends.message.compose")}
          id={`${titleId}-body`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={CHAT_TEXT_MAX_LENGTH}
          autoComplete="off"
          placeholder={compact ? t("friends.quickChat.placeholder") : undefined}
          disabled={unavailable || pending}
        />
        <Button
          className={compact ? "quick-chat-send" : undefined}
          aria-label={compact ? t("friends.message.send") : undefined}
          icon={Icons.Send}
          type="submit"
          disabled={unavailable || pending || !social.connected || cooldown || !body.trim()}
        >
          {compact ? null : t("friends.message.send")}
        </Button>
      </form>
    </section>
  );
  if (embedded) {
    return (
      <aside className={compact ? "friends-conversation quick-chat-conversation" : "friends-conversation"}>
        {content}
      </aside>
    );
  }
  return (
    <Dialog className="direct-messages-dialog" labelledBy={titleId} onClose={onClose} closeOnBackdrop={false}>
      {content}
    </Dialog>
  );
}
