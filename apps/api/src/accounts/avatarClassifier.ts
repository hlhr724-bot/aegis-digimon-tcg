import type { AvatarImage } from "#api/accounts/avatarImage";

export type AvatarVerdict = "safe" | "nsfw";

export type AvatarModeration = AvatarVerdict | "unavailable" | "unscreened";

export type AvatarClassifier = {
  name: string;
  classify: (image: AvatarImage) => Promise<AvatarVerdict>;
};
