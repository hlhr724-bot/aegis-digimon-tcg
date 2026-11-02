import { CommunitySection } from "@/community/CommunitySection";
import type { AppRoute } from "@/routes";

export function getCommunitySectionRoute(section: CommunitySection): AppRoute {
  if (section === CommunitySection.ROADMAP.value) {
    return { screen: "roadmap" };
  }
  if (section === CommunitySection.META.value) {
    return { screen: "community", communityMeta: true };
  }
  return { screen: "community" };
}
