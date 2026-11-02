import { useEffect, type ReactNode } from "react";
import type { AccountNotification } from "@aegis/shared/feedback/types";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { NotificationItem } from "@/notifications/NotificationItem";
import { openNotification } from "@/notifications/openNotification";
import type { NotificationInbox } from "@/notifications/useNotificationInbox";
import { NotificationsTab } from "@/notifications/NotificationsTab";
import "@/notifications/notificationBell.css";
import "@/notifications/notificationsScreen.css";

type NotificationsScreenParams = {
  inbox: NotificationInbox;
  tab: NotificationsTab;
  feedback: ReactNode;
  onTabChange: (tab: NotificationsTab) => void;
  onOpenFeedback: (feedbackId?: number) => void;
};

export function NotificationsScreen({ inbox, tab, feedback, onTabChange, onOpenFeedback }: NotificationsScreenParams) {
  const { t } = useTranslation();
  const { load } = inbox;
  useEffect(() => {
    if (tab === NotificationsTab.ALL.value) {
      void load();
    }
  }, [tab, load]);

  function select(notification: AccountNotification) {
    void inbox.markRead([notification.id]);
    openNotification({ notification, onOpenFeedback });
  }

  return (
    <section className="notifications-page" aria-labelledby="notifications-title">
      <div className="notifications-column">
        <header className="notifications-header">
          <h1 id="notifications-title" className="aegis-page-title">
            {t("notifications.title")}
          </h1>
          {tab === NotificationsTab.ALL.value ? (
            <Button variant="secondary" disabled={inbox.unread === 0} onClick={() => void inbox.markAllRead()}>
              {t("notifications.markAllRead")}
            </Button>
          ) : null}
        </header>
        <nav className="notifications-tabs" aria-label={t("notifications.title")}>
          <button
            aria-current={tab === NotificationsTab.ALL.value ? "page" : undefined}
            onClick={() => onTabChange(NotificationsTab.ALL.value)}
          >
            {t("notifications.tab.all")}
            {inbox.unread > 0 ? (
              <span className="notifications-tab-count">
                <span className="aegis-sr-only">{t("notifications.unread")} </span>
                {inbox.unread}
              </span>
            ) : null}
          </button>
          <button
            aria-current={tab === NotificationsTab.FEEDBACK.value ? "page" : undefined}
            onClick={() => onTabChange(NotificationsTab.FEEDBACK.value)}
          >
            {t("myFeedback.title")}
          </button>
        </nav>
        {tab === NotificationsTab.FEEDBACK.value ? (
          feedback
        ) : (
          <div className="notifications-card">
            {inbox.failed ? <p className="aegis-notifications__state">{t("notifications.failed")}</p> : null}
            {!inbox.failed && inbox.loading && inbox.items.length === 0 ? (
              <p className="aegis-notifications__state" role="status">
                {t("common.loading")}
              </p>
            ) : null}
            {!inbox.failed && !inbox.loading && inbox.items.length === 0 ? (
              <p className="aegis-notifications__state">{t("notifications.empty")}</p>
            ) : null}
            {inbox.items.length ? (
              <ul className="aegis-notifications__list">
                {inbox.items.map((notification) => (
                  <li key={notification.id}>
                    <NotificationItem notification={notification} onSelect={() => select(notification)} />
                  </li>
                ))}
              </ul>
            ) : null}
            {inbox.nextBefore !== null ? (
              <button
                className="aegis-notifications__text-button aegis-notifications__more"
                disabled={inbox.loading}
                onClick={() => void inbox.loadMore()}
              >
                {t("notifications.older")}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
