import type { ActiveMatch } from "#shared/protocol/ActiveMatch";

export type ActiveMatchClaim = ActiveMatch & {
  reconnectionToken: string;
};
