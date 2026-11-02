import type { AccountNotification } from "@aegis/shared/feedback/types";

type OpenNotificationParams = {
  notification: AccountNotification;
  onOpenFeedback: (feedbackId?: number) => void;
};

export function openNotification({ notification, onOpenFeedback }: OpenNotificationParams): void {
  if (notification.kind === "ranked_report_ruling") {
    return;
  }
  if (notification.kind === "playtest_study") {
    if (notification.payload.closesAt > Date.now()) {
      window.open(notification.payload.link, "_blank", "noopener");
    }
    return;
  }
  if (notification.kind === "friend_request" || notification.kind === "friend_accepted") {
    window.location.assign("/friends");
    return;
  }
  onOpenFeedback(notification.payload.feedbackId);
}
