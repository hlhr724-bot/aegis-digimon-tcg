export const AccountRole = {
  ADMIN: {
    name: "ADMIN",
    value: "admin",
    labelKey: "account.roles.admin",
    canAdminister: true,
    canOrganizeOfficialTournaments: true,
    canJudge: true,
  },
  JUDGE: {
    name: "JUDGE",
    value: "judge",
    labelKey: "account.roles.judge",
    canAdminister: false,
    canOrganizeOfficialTournaments: false,
    canJudge: true,
  },
  ORGANIZER: {
    name: "ORGANIZER",
    value: "organizer",
    labelKey: "account.roles.organizer",
    canAdminister: false,
    canOrganizeOfficialTournaments: true,
    canJudge: false,
  },
} as const;

export type AccountRole = (typeof AccountRole)[keyof typeof AccountRole]["value"];

export type AccountRoleCapability = "canAdminister" | "canOrganizeOfficialTournaments" | "canJudge";
