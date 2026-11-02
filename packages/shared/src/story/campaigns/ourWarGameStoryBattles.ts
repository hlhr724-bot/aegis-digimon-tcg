import type { StoryCatalogBattle } from "#shared/story/StoryCatalogBattle";

export const ourWarGameStoryBattles: readonly StoryCatalogBattle[] = [
  {
    id: "FI02",
    campaignId: "our-war-game",
    chapter: "Our War Game",
    title: "WarGreymon + MetalGarurumon vs. Diaboromon",
    playerDeckRefs: ["WMD17"],
    opponentDeckRef: "WMD46",
    sourceUrl: "https://wikimon.net/Digimon_Adventure:_Our_War_Game!",
  },
  {
    id: "FI03",
    campaignId: "our-war-game",
    chapter: "Our War Game",
    title: "Omnimon vs. Diaboromon and its copies",
    playerDeckRefs: ["WMD62"],
    opponentDeckRef: "WMD46",
    sourceUrl: "https://wikimon.net/Digimon_Adventure:_Our_War_Game!",
  },
];
