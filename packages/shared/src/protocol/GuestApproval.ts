export const GuestApproval = {
  NOT_REQUIRED: { name: "NOT_REQUIRED", value: "", blocksMatchStart: false, holdsMatchBoard: false },
  AWAITING_GUEST: { name: "AWAITING_GUEST", value: "awaitingGuest", blocksMatchStart: false, holdsMatchBoard: true },
  PENDING: { name: "PENDING", value: "pending", blocksMatchStart: true, holdsMatchBoard: true },
  APPROVED: { name: "APPROVED", value: "approved", blocksMatchStart: false, holdsMatchBoard: false },
} as const;

export type GuestApproval = (typeof GuestApproval)[keyof typeof GuestApproval]["value"];
