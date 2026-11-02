import { expect, it } from "vitest";
import { getStoryCampaignBattles } from "@aegis/shared/story/getStoryCampaignBattles";
import { digimonSaversDataSquadStoryBattles } from "@aegis/shared/story/campaigns/digimonSaversDataSquadStoryBattles";
import { digimonXrosWarsStoryBattles } from "@aegis/shared/story/campaigns/digimonXrosWarsStoryBattles";
import { digimonXrosWarsHuntersStoryBattles } from "@aegis/shared/story/campaigns/digimonXrosWarsHuntersStoryBattles";
import { digimonAdventure2020StoryBattles } from "@aegis/shared/story/campaigns/digimonAdventure2020StoryBattles";
import { digimonGhostGameStoryBattles } from "@aegis/shared/story/campaigns/digimonGhostGameStoryBattles";
import { digimonBeatbreakStoryBattles } from "@aegis/shared/story/campaigns/digimonBeatbreakStoryBattles";
import { catalogStoryBattles } from "@aegis/shared/story/catalogStoryBattles";
import { storyCatalogDecks } from "@aegis/shared/story/storyCatalogDecks";
import { getCardDefinition } from "@aegis/shared/cards/registry";

it.each([
  ["digimon-savers-data-squad", 17, "sv01", "sa06"],
  ["digimon-xros-wars", 17, "xw08", "xw06"],
  ["digimon-xros-wars-hunters", 16, "hu01", "xw07"],
  ["digimon-adventure-2020", 16, "av01", "re03"],
  ["digimon-ghost-game", 16, "gg02", "gg01"],
  ["digimon-beatbreak", 12, "bb01", "bb13"],
] as const)("publishes the expanded chronological campaign %s", (campaignId, count, first, last) => {
  const battles = getStoryCampaignBattles({ campaignId });
  expect(battles).toHaveLength(count);
  expect(battles[0]?.id).toBe(first);
  expect(battles.at(-1)?.id).toBe(last);
  expect(battles.every((battle) => battle.playable)).toBe(true);
});

const animeStoryBattles = [
  ...digimonSaversDataSquadStoryBattles,
  ...digimonXrosWarsStoryBattles,
  ...digimonXrosWarsHuntersStoryBattles,
  ...digimonAdventure2020StoryBattles,
  ...digimonGhostGameStoryBattles,
  ...digimonBeatbreakStoryBattles,
];

it("records official episode evidence", () => {
  const selected = animeStoryBattles.filter((battle) => battle.id !== "XW05");
  expect(selected.every((battle) => /^https:\/\/(?:www\.|lineup\.)toei-anim\.co\.jp\//.test(battle.sourceUrl))).toBe(
    true,
  );
  expect(selected.find((battle) => battle.id === "SA02")?.protagonist).toBe("Sleipmon and DATS");
});

it.each(["sa06", "cs42"])(
  "gives the Yggdrasil encounter %s the Royal Knights deck with King Drasil eggs",
  (battleId) => {
    const battle = catalogStoryBattles.find((entry) => entry.id === battleId)!;
    const deck = storyCatalogDecks[battle.opponentDeckRef!];
    expect(deck.eggs.map(([card]) => getCardDefinition(card)?.nameEn)).toContain("King Drasil_7D6");
    expect(deck.main.map(([card]) => getCardDefinition(card)?.nameEn)).toEqual(
      expect.arrayContaining(["Gallantmon", "LordKnightmon", "Leopardmon", "Craniamon"]),
    );
  },
);
