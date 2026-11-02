import type { AvatarImage } from "#api/accounts/avatarImage";
import type { AvatarClassifier, AvatarModeration } from "#api/accounts/avatarClassifier";

export type AvatarModerator = (image: AvatarImage) => Promise<AvatarModeration>;

export function createAvatarModerator({
  classifiers,
  allowUnscreened,
  report = (name, error) => console.warn(`[avatar] ${name} moderation failed:`, error.message),
}: {
  classifiers: AvatarClassifier[];
  allowUnscreened: boolean;
  report?: (name: string, error: Error) => void;
}): AvatarModerator {
  return async (image) => {
    if (!classifiers.length) return allowUnscreened ? "unscreened" : "unavailable";
    for (const classifier of classifiers) {
      try {
        return await classifier.classify(image);
      } catch (error) {
        report(classifier.name, error instanceof Error ? error : new Error(String(error)));
      }
    }
    return "unavailable";
  };
}
