import type { AccountNotification } from "@aegis/shared/feedback/types";
import type { RankedReportRulingNotification } from "@aegis/shared/ranked/RankedContracts";
import { RankedReportStatus } from "@aegis/shared/ranked/RankedReportStatus";
import type { TranslationKey } from "@/i18n/translationTypes";
import { formatRatingChange } from "@/ranked/formatRatingChange";
import { relativeTime } from "@/i18n/relativeTime";
import { FEEDBACK_STATUS_TONE } from "@/bugs/feedbackStatus";
import { Badge } from "@/design/primitives";
import { formatTournamentDateTime } from "@/tournaments/formatTournamentDateTime";
import { useTranslation } from "@/i18n/useTranslation";

type NotificationItemParams = { notification: AccountNotification; onSelect: () => void };

export function NotificationItem({ notification, onSelect }: NotificationItemParams) {
  const { t, locale } = useTranslation();
  const unread = notification.readAt === null;
  const when = (
    <time dateTime={new Date(notification.createdAt).toISOString()}>
      {relativeTime({ at: notification.createdAt, locale })}
    </time>
  );
  if (notification.kind === "ranked_report_ruling") {
    const { payload } = notification;
    return (
      <button className="aegis-notifications__item" data-unread={unread || undefined} onClick={onSelect}>
        <span className="aegis-notifications__dot" aria-hidden="true" />
        <span className="aegis-notifications__copy">
          <span className="aegis-notifications__headline">
            {unread ? <span className="aegis-sr-only">{t("notifications.unread")} </span> : null}
            {t(getRankedRulingKey(payload), { opponent: payload.opponentName })}
          </span>
          {payload.ratingChange !== null ? (
            <span className="aegis-notifications__excerpt">
              {t("ranked.report.ratingChange", { change: formatRatingChange(payload.ratingChange) })}
            </span>
          ) : null}
          {when}
        </span>
        <Badge tone={payload.status === RankedReportStatus.CONFIRMED.value ? "success" : "neutral"}>
          {t("ranked.report.notification.badge")}
        </Badge>
      </button>
    );
  }
  if (notification.kind === "playtest_study") {
    const { payload } = notification;
    return (
      <button className="aegis-notifications__item" data-unread={unread || undefined} onClick={onSelect}>
        <span className="aegis-notifications__dot" aria-hidden="true" />
        <span className="aegis-notifications__copy">
          <span className="aegis-notifications__headline">
            {unread ? <span className="aegis-sr-only">{t("notifications.unread")} </span> : null}
            {t(payload.closesAt <= Date.now() ? "notifications.playtest.closed" : "notifications.playtest.invite", {
              title: payload.title,
            })}
          </span>
          <span className="aegis-notifications__excerpt">{payload.blurb}</span>
          {when}
        </span>
        <Badge tone="primary">{t("notifications.playtest.badge")}</Badge>
      </button>
    );
  }
  if (notification.kind === "tournament_start_overdue" || notification.kind === "tournament_expired") {
    const overdue = notification.kind === "tournament_start_overdue";
    const headline =
      notification.kind === "tournament_start_overdue"
        ? t("notifications.tournament.startOverdue", {
            name: notification.payload.tournamentName,
            deadline: formatTournamentDateTime({ epochMs: notification.payload.cancelsAt, locale }),
          })
        : t("notifications.tournament.expired", { name: notification.payload.tournamentName });
    return (
      <button className="aegis-notifications__item" data-unread={unread || undefined} onClick={onSelect}>
        <span className="aegis-notifications__dot" aria-hidden="true" />
        <span className="aegis-notifications__copy">
          <span className="aegis-notifications__headline">
            {unread ? <span className="aegis-sr-only">{t("notifications.unread")} </span> : null}
            {headline}
          </span>
          {when}
        </span>
        <Badge tone={overdue ? "warning" : "neutral"}>{t("notifications.tournament.badge")}</Badge>
      </button>
    );
  }
  if (notification.kind === "tournament_started" || notification.kind === "tournament_match_ready") {
    const headline =
      notification.kind === "tournament_started"
        ? t("notifications.tournament.started", { name: notification.payload.tournamentName })
        : t("notifications.tournament.matchReady", {
            name: notification.payload.tournamentName,
            round: notification.payload.round,
          });
    return (
      <button className="aegis-notifications__item" data-unread={unread || undefined} onClick={onSelect}>
        <span className="aegis-notifications__dot" aria-hidden="true" />
        <span className="aegis-notifications__copy">
          <span className="aegis-notifications__headline">
            {unread ? <span className="aegis-sr-only">{t("notifications.unread")} </span> : null}
            {headline}
          </span>
          {when}
        </span>
        <Badge tone="primary">{t("notifications.tournament.badge")}</Badge>
      </button>
    );
  }
  if (notification.kind === "friend_request" || notification.kind === "friend_accepted") {
    return (
      <button className="aegis-notifications__item" data-unread={unread || undefined} onClick={onSelect}>
        <span className="aegis-notifications__dot" aria-hidden="true" />
        <span className="aegis-notifications__copy">
          <span className="aegis-notifications__headline">
            {unread ? <span className="aegis-sr-only">{t("notifications.unread")} </span> : null}
            {t(`friends.notification.${notification.kind}`, { name: notification.payload.displayName })}
          </span>
          {when}
        </span>
      </button>
    );
  }
  const { payload } = notification;
  return (
    <button className="aegis-notifications__item" data-unread={unread || undefined} onClick={onSelect}>
      <span className="aegis-notifications__dot" aria-hidden="true" />
      <span className="aegis-notifications__copy">
        <span className="aegis-notifications__headline">
          {unread ? <span className="aegis-sr-only">{t("notifications.unread")} </span> : null}
          {payload.bugConfirmed && payload.previousStatus === payload.status
            ? t("notifications.feedback.confirmed", { summary: payload.summary })
            : t(`notifications.feedback.${payload.status}`, { summary: payload.summary })}
        </span>
        {payload.replyExcerpt ? <span className="aegis-notifications__excerpt">{payload.replyExcerpt}</span> : null}
        {payload.bugConfirmed ? (
          <span className="aegis-notifications__bonus">{t("notifications.bugConfirmedPoint")}</span>
        ) : null}
        {when}
      </span>
      <Badge tone={FEEDBACK_STATUS_TONE[payload.status]}>{t(`feedback.status.${payload.status}`)}</Badge>
    </button>
  );
}

function getRankedRulingKey(payload: RankedReportRulingNotification): TranslationKey {
  const confirmed = payload.status === RankedReportStatus.CONFIRMED.value;
  if (confirmed && payload.reporter) {
    return "ranked.report.notification.confirmedReporter";
  }
  if (confirmed) {
    return "ranked.report.notification.confirmedOpponent";
  }
  if (payload.reporter) {
    return "ranked.report.notification.rejectedReporter";
  }
  return "ranked.report.notification.rejectedOpponent";
}
