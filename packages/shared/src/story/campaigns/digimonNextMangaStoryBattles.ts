import type { StoryCatalogBattle } from "#shared/story/StoryCatalogBattle";

export const digimonNextMangaStoryBattles: readonly StoryCatalogBattle[] = [
  {
    id: "MA06",
    campaignId: "digimon-next-manga",
    chapter: "Next · Barbamon",
    title: "VictoryGreymon vs. Barbamon",
    playerDeckRefs: ["WMD17"],
    opponentDeckRef: "WMD15",
    sourceUrl: "https://wikimon.net/Victory_Greymon",
  },
  {
    id: "MA07",
    campaignId: "digimon-next-manga",
    chapter: "Next · finale",
    title: "VictoryGreymon + Z'dGarurumon, with MarinAngemon and DigiSouls, vs. NEO",
    playerDeckRefs: ["WMD17"],
    opponentDeckRef: "WMD49",
    sourceUrl: "https://wikimon.net/N.E.O_%28Next%29",
  },
];
