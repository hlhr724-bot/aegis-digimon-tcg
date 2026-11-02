export const NotificationsTab = {
  ALL: { name: "ALL", value: "all" },
  FEEDBACK: { name: "FEEDBACK", value: "feedback" },
} as const;

export type NotificationsTab = (typeof NotificationsTab)[keyof typeof NotificationsTab]["value"];
