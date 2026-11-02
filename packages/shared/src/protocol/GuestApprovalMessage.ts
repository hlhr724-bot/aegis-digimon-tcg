export const GUEST_APPROVAL_CHANNEL = "guestApproval" as const;

export type GuestApprovalMessage = {
  guestSessionId: string;
  accept: boolean;
};
