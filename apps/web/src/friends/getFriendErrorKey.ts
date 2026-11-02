import { AccountApiError } from "@/account/client";
import { FriendshipError } from "@aegis/shared/friends/FriendshipError";
import type { TranslationKey } from "@/i18n/translationTypes";

export function getFriendErrorKey(error: unknown): TranslationKey {
  if (error instanceof AccountApiError) {
    for (const entry of Object.values(FriendshipError)) {
      if (entry.value === error.code) {
        return `friends.error.${entry.value}`;
      }
    }
    if (error.status === 401) {
      return "friends.signIn";
    }
    if (error.status === 429) {
      return "friends.rateLimited";
    }
  }
  return "friends.failed";
}
