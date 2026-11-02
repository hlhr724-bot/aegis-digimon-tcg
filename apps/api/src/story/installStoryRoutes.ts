import type { StoryCampaignProgress } from "@aegis/shared/story/StoryCampaignProgress";
import { getStoryMilestones } from "@aegis/shared/story/getStoryMilestones";
import { getStoryGuestHash } from "#api/story/getStoryGuestHash";
import type { Express, Request } from "express";
import type { AuthSession } from "#api/accounts/AccountStore";
import type { StoryProgressStore } from "#api/story/StoryProgressStore";

type Params = {
  app: Express;
  store: StoryProgressStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

export function installStoryRoutes({ app, store, session }: Params): void {
  app.get(["/story/progress", "/story/campaign-progress"], async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      const send = (progress: { completed: string[] }) => {
        if (req.path === "/story/campaign-progress") {
          const campaignProgress: StoryCampaignProgress = {
            ...progress,
            milestones: getStoryMilestones(progress),
            contentRevision: "story-catalog-v3",
          };
          res.json(campaignProgress);
          return;
        }
        res.json(progress);
      };
      const auth = await session(req);
      if (!auth) {
        const guestHash = getStoryGuestHash(req.get("Authorization")?.replace(/^StoryGuest /, ""));
        if (!guestHash) {
          res.status(401).json({ error: "story_guest_token_required" });
          return;
        }
        send(await store.getGuestProgress(guestHash));
        return;
      }
      send(await store.getProgress(auth.account.id));
    } catch (error) {
      next(error);
    }
  });
}
