export const TournamentReportReason = {
  OFFENSIVE_CONTENT: {
    name: "OFFENSIVE_CONTENT",
    value: "offensive_content",
    labelKey: "tournaments.report.reason.offensive_content",
  },
  FAKE_EVENT: { name: "FAKE_EVENT", value: "fake_event", labelKey: "tournaments.report.reason.fake_event" },
  ORGANIZER_ABUSE: {
    name: "ORGANIZER_ABUSE",
    value: "organizer_abuse",
    labelKey: "tournaments.report.reason.organizer_abuse",
  },
  OTHER: { name: "OTHER", value: "other", labelKey: "tournaments.report.reason.other" },
} as const;

export type TournamentReportReason = (typeof TournamentReportReason)[keyof typeof TournamentReportReason]["value"];
