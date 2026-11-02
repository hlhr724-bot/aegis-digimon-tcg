import type { Friend } from "#shared/friends/Friend";
import type { SocialPresence } from "#shared/social/SocialPresence";
import type { SavedReplay, MatchHistorySummary } from "#shared/replays";

export type FriendDetail = {
  friend: Friend & SocialPresence;
  replays: SavedReplay[];
  stats: MatchHistorySummary | null;
};
