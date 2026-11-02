import { useEffect, useState } from "react";
import type { StoryBattle } from "@aegis/shared/story/StoryBattle";
import { loadStoryCampaignBattles } from "@aegis/shared/story/loadStoryCampaignBattles";

type Params = { campaignId: string | undefined };

type LoadedCampaign = { campaignId: string; battles: readonly StoryBattle[] };

export function useStoryCampaignBattles({ campaignId }: Params): readonly StoryBattle[] | undefined {
  const [loaded, setLoaded] = useState<LoadedCampaign>();
  useEffect(() => {
    if (!campaignId) {
      return undefined;
    }
    let active = true;
    void loadStoryCampaignBattles({ campaignId }).then((battles) => {
      if (active) {
        setLoaded({ campaignId, battles });
      }
    });
    return () => {
      active = false;
    };
  }, [campaignId]);
  return loaded && loaded.campaignId === campaignId ? loaded.battles : undefined;
}
