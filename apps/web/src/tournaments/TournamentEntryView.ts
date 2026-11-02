export const TournamentEntryView = {
  SIGNED_OUT: { name: "SIGNED_OUT", value: "signed_out", showsProgress: false },
  OPEN: { name: "OPEN", value: "open", showsProgress: false },
  SIGNUP: { name: "SIGNUP", value: "signup", showsProgress: false },
  REGISTERED: { name: "REGISTERED", value: "registered", showsProgress: true },
  CHECK_IN: { name: "CHECK_IN", value: "check_in", showsProgress: true },
  CHECKED_IN: { name: "CHECKED_IN", value: "checked_in", showsProgress: true },
  SUMMARY: { name: "SUMMARY", value: "summary", showsProgress: false },
} as const;

export type TournamentEntryView = (typeof TournamentEntryView)[keyof typeof TournamentEntryView]["value"];

export type TournamentEntryViewEntry = (typeof TournamentEntryView)[keyof typeof TournamentEntryView];
