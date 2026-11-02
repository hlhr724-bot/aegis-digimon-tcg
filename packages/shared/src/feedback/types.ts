import type { FeedbackStatus } from "#shared/feedback/FeedbackStatus";
import type { PlaytestStudyNotification } from "#shared/playtest/types";
import type { RankedReportRulingNotification } from "#shared/ranked/RankedContracts";

export const SUBMITTABLE_FEEDBACK_KINDS = ["bug", "improvement", "other"] as const;
export type SubmittableFeedbackKind = (typeof SUBMITTABLE_FEEDBACK_KINDS)[number];
export const FEEDBACK_KINDS = [...SUBMITTABLE_FEEDBACK_KINDS, "official_tournament"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export type FeedbackStatusChange = {
  from: FeedbackStatus | null;
  to: FeedbackStatus;
  at: number;
  byReporter: boolean;
  comment: string | null;
};

export type OwnFeedbackReport = {
  id: number;
  kind: FeedbackKind;
  summary: string;
  description: string;
  cardIds: string[];
  createdAt: number;
  status: FeedbackStatus;
  finalReply: string | null;
  duplicateOfId: number | null;
  history: FeedbackStatusChange[];
  reopenDeadline: number | null;
  confirmedBug: boolean;
};

export type FeedbackReopenFailure =
  | "empty_comment"
  | "comment_too_long"
  | "not_closed"
  | "already_reopened"
  | "reopen_window_closed"
  | "not_found";

export type OwnFeedbackPage = {
  items: OwnFeedbackReport[];
  nextBefore: number | null;
  confirmedBugs: number;
};

export type FeedbackTriageUpdate = {
  revision: number;
  status: FeedbackStatus;
  finalReply: string;
  internalNote: string;
  duplicateOfId: number | null;
  confirmedBug?: boolean;
};

export type FeedbackTriageFailure =
  | "invalid_status"
  | "invalid_revision"
  | "final_reply_required"
  | "final_reply_too_long"
  | "internal_note_too_long"
  | "duplicate_target_required"
  | "invalid_duplicate_target"
  | "stale_revision"
  | "not_found";

export const NOTIFICATION_KINDS = [
  "feedback_update",
  "playtest_study",
  "ranked_report_ruling",
  "friend_request",
  "friend_accepted",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type FeedbackUpdateNotification = {
  feedbackId: number;
  summary: string;
  status: FeedbackStatus;
  previousStatus: FeedbackStatus;
  replyExcerpt: string | null;
  bugConfirmed: boolean;
};

export type NotificationBody =
  | { kind: "feedback_update"; payload: FeedbackUpdateNotification }
  | { kind: "playtest_study"; payload: PlaytestStudyNotification }
  | { kind: "ranked_report_ruling"; payload: RankedReportRulingNotification }
  | { kind: "friend_request"; payload: { accountId: string; displayName: string } }
  | { kind: "friend_accepted"; payload: { accountId: string; displayName: string } };

export type AccountNotification = { id: number; createdAt: number; readAt: number | null } & NotificationBody;

export type NotificationPage = { items: AccountNotification[]; nextBefore: number | null; unread: number };
