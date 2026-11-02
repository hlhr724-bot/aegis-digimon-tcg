import type { SocialStatus } from "#shared/social/SocialStatus";

export type SocialPresence = {
  accountId: string;
  status: SocialStatus | null;
  roomCode?: string;
};
