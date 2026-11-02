import type { DigimonWorldAvatarId } from "#shared/account/avatars";

export type Friend = {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  avatarId: DigimonWorldAvatarId | null;
  since: number;
};
