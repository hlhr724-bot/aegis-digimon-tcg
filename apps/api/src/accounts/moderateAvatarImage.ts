import type { AvatarImage } from "#api/accounts/avatarImage";
import type { AvatarModeration } from "#api/accounts/avatarClassifier";
import type { AvatarModerator } from "#api/accounts/createAvatarModerator";
import { avatarModeratorFromEnvironment } from "#api/accounts/avatarModeratorFromEnvironment";

let moderator: AvatarModerator | undefined;

export function moderateAvatarImage(image: AvatarImage): Promise<AvatarModeration> {
  moderator ??= avatarModeratorFromEnvironment();
  return moderator(image);
}
