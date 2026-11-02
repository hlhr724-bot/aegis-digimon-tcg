import type { AvatarChoice } from "@aegis/shared/account/avatars";

export type FriendRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_id: AvatarChoice;
  created_at: string;
};
