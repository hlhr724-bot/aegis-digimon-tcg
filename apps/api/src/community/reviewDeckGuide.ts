import { COMMUNITY_GUIDE_MAX, type CommunityGuideError } from "@aegis/shared/decks/community";
import { normalizeDeckGuide } from "@aegis/shared/decks/guide/normalizeDeckGuide";
import { hasBlockedCommunityText } from "#api/community/hasBlockedCommunityText";

type Params = { raw: unknown };
type Review = { allowed: true; guide: string | null } | { allowed: false; error: CommunityGuideError };

export function reviewDeckGuide({ raw }: Params): Review {
  if (raw !== null && typeof raw !== "string") {
    return { allowed: false, error: "invalid_guide" };
  }
  const guide = normalizeDeckGuide({ raw });
  if (guide && guide.length > COMMUNITY_GUIDE_MAX) {
    return { allowed: false, error: "guide_too_long" };
  }
  if (guide && hasBlockedCommunityText(guide)) {
    return { allowed: false, error: "guide_not_allowed" };
  }
  return { allowed: true, guide };
}
