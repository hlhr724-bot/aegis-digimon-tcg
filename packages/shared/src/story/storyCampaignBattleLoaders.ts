import type { StoryBattle } from "#shared/story/StoryBattle";
import { StoryCampaignId } from "#shared/story/StoryCampaignId";
import { toCatalogStoryBattle } from "#shared/story/toCatalogStoryBattle";

export const storyCampaignBattleLoaders: Readonly<Record<string, () => Promise<readonly StoryBattle[]>>> = {
  [StoryCampaignId.LIBERATOR.value]: () =>
    import("#shared/story/liberatorStoryBattles").then(({ liberatorStoryBattles }) => liberatorStoryBattles),
  "digimon-world-1": () =>
    import("#shared/story/campaigns/digimonWorld1StoryBattles").then(({ digimonWorld1StoryBattles }) =>
      digimonWorld1StoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-world-2": () =>
    import("#shared/story/campaigns/digimonWorld2StoryBattles").then(({ digimonWorld2StoryBattles }) =>
      digimonWorld2StoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-world-3": () =>
    import("#shared/story/campaigns/digimonWorld3StoryBattles").then(({ digimonWorld3StoryBattles }) =>
      digimonWorld3StoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-adventure-1999": () =>
    import("#shared/story/campaigns/digimonAdventure1999StoryBattles").then(({ digimonAdventure1999StoryBattles }) =>
      digimonAdventure1999StoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-adventure-02": () =>
    import("#shared/story/campaigns/digimonAdventure02StoryBattles").then(({ digimonAdventure02StoryBattles }) =>
      digimonAdventure02StoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-tamers": () =>
    import("#shared/story/campaigns/digimonTamersStoryBattles").then(({ digimonTamersStoryBattles }) =>
      digimonTamersStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-frontier": () =>
    import("#shared/story/campaigns/digimonFrontierStoryBattles").then(({ digimonFrontierStoryBattles }) =>
      digimonFrontierStoryBattles.map(toCatalogStoryBattle),
    ),
  "adventure-filme-de-1999": () =>
    import("#shared/story/campaigns/adventureFilmeDe1999StoryBattles").then(({ adventureFilmeDe1999StoryBattles }) =>
      adventureFilmeDe1999StoryBattles.map(toCatalogStoryBattle),
    ),
  "our-war-game": () =>
    import("#shared/story/campaigns/ourWarGameStoryBattles").then(({ ourWarGameStoryBattles }) =>
      ourWarGameStoryBattles.map(toCatalogStoryBattle),
    ),
  "hurricane-touchdown-golden-digimentals": () =>
    import("#shared/story/campaigns/hurricaneTouchdownGoldenDigimentalsStoryBattles").then(
      ({ hurricaneTouchdownGoldenDigimentalsStoryBattles }) =>
        hurricaneTouchdownGoldenDigimentalsStoryBattles.map(toCatalogStoryBattle),
    ),
  "revenge-of-diaboromon": () =>
    import("#shared/story/campaigns/revengeOfDiaboromonStoryBattles").then(({ revengeOfDiaboromonStoryBattles }) =>
      revengeOfDiaboromonStoryBattles.map(toCatalogStoryBattle),
    ),
  "tamers-battle-of-adventurers": () =>
    import("#shared/story/campaigns/tamersBattleOfAdventurersStoryBattles").then(
      ({ tamersBattleOfAdventurersStoryBattles }) => tamersBattleOfAdventurersStoryBattles.map(toCatalogStoryBattle),
    ),
  "tamers-runaway-locomon": () =>
    import("#shared/story/campaigns/tamersRunawayLocomonStoryBattles").then(({ tamersRunawayLocomonStoryBattles }) =>
      tamersRunawayLocomonStoryBattles.map(toCatalogStoryBattle),
    ),
  "frontier-revival-of-the-ancient-digimon": () =>
    import("#shared/story/campaigns/frontierRevivalOfTheAncientDigimonStoryBattles").then(
      ({ frontierRevivalOfTheAncientDigimonStoryBattles }) =>
        frontierRevivalOfTheAncientDigimonStoryBattles.map(toCatalogStoryBattle),
    ),
  "digital-monster-x-evolution": () =>
    import("#shared/story/campaigns/digitalMonsterXEvolutionStoryBattles").then(
      ({ digitalMonsterXEvolutionStoryBattles }) => digitalMonsterXEvolutionStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-adventure-tri": () =>
    import("#shared/story/campaigns/digimonAdventureTriStoryBattles").then(({ digimonAdventureTriStoryBattles }) =>
      digimonAdventureTriStoryBattles.map(toCatalogStoryBattle),
    ),
  "last-evolution-kizuna": () =>
    import("#shared/story/campaigns/lastEvolutionKizunaStoryBattles").then(({ lastEvolutionKizunaStoryBattles }) =>
      lastEvolutionKizunaStoryBattles.map(toCatalogStoryBattle),
    ),
  "adventure-02-the-beginning": () =>
    import("#shared/story/campaigns/adventure02TheBeginningStoryBattles").then(
      ({ adventure02TheBeginningStoryBattles }) => adventure02TheBeginningStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-v-tamer-01-manga": () =>
    import("#shared/story/campaigns/digimonVTamer01MangaStoryBattles").then(({ digimonVTamer01MangaStoryBattles }) =>
      digimonVTamer01MangaStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-next-manga": () =>
    import("#shared/story/campaigns/digimonNextMangaStoryBattles").then(({ digimonNextMangaStoryBattles }) =>
      digimonNextMangaStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-xros-wars-manga": () =>
    import("#shared/story/campaigns/digimonXrosWarsMangaStoryBattles").then(({ digimonXrosWarsMangaStoryBattles }) =>
      digimonXrosWarsMangaStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-hacker-s-memory": () =>
    import("#shared/story/campaigns/digimonHackerSMemoryStoryBattles").then(({ digimonHackerSMemoryStoryBattles }) =>
      digimonHackerSMemoryStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-survive": () =>
    import("#shared/story/campaigns/digimonSurviveStoryBattles").then(({ digimonSurviveStoryBattles }) =>
      digimonSurviveStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-dawn-dusk": () =>
    import("#shared/story/campaigns/digimonDawnDuskStoryBattles").then(({ digimonDawnDuskStoryBattles }) =>
      digimonDawnDuskStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-cyber-sleuth": () =>
    import("#shared/story/campaigns/digimonCyberSleuthStoryBattles").then(({ digimonCyberSleuthStoryBattles }) =>
      digimonCyberSleuthStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-seekers": () =>
    import("#shared/story/campaigns/digimonSeekersStoryBattles").then(({ digimonSeekersStoryBattles }) =>
      digimonSeekersStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-savers-data-squad": () =>
    import("#shared/story/campaigns/digimonSaversDataSquadStoryBattles").then(
      ({ digimonSaversDataSquadStoryBattles }) => digimonSaversDataSquadStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-xros-wars": () =>
    import("#shared/story/campaigns/digimonXrosWarsStoryBattles").then(({ digimonXrosWarsStoryBattles }) =>
      digimonXrosWarsStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-xros-wars-hunters": () =>
    import("#shared/story/campaigns/digimonXrosWarsHuntersStoryBattles").then(
      ({ digimonXrosWarsHuntersStoryBattles }) => digimonXrosWarsHuntersStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-adventure-2020": () =>
    import("#shared/story/campaigns/digimonAdventure2020StoryBattles").then(({ digimonAdventure2020StoryBattles }) =>
      digimonAdventure2020StoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-ghost-game": () =>
    import("#shared/story/campaigns/digimonGhostGameStoryBattles").then(({ digimonGhostGameStoryBattles }) =>
      digimonGhostGameStoryBattles.map(toCatalogStoryBattle),
    ),
  "digimon-beatbreak": () =>
    import("#shared/story/campaigns/digimonBeatbreakStoryBattles").then(({ digimonBeatbreakStoryBattles }) =>
      digimonBeatbreakStoryBattles.map(toCatalogStoryBattle),
    ),
};
