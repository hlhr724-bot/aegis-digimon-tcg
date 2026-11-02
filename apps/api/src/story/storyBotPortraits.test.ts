import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { getBotPortraitPath } from "@aegis/shared/bot/personas/getBotPortraitPath";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import { getStoryBotPersona } from "#api/story/getStoryBotPersona";
import { getStoryScenario } from "#api/story/getStoryScenario";

const publicDirectory = fileURLToPath(new URL("../../../web/public", import.meta.url));
const digimonWithoutArtwork = new Set(["Argomon", "Gokuumon", "GreatGrizzlymon", "MockingBirdmon"]);

it("ships a portrait for every story opponent persona", () => {
  const missing = new Set<string>();
  for (const battle of storyBattles.filter((entry) => entry.playable)) {
    const persona = getStoryBotPersona({ battleId: battle.id, fixture: getStoryScenario(battle.id)! });
    if (persona && !existsSync(`${publicDirectory}${getBotPortraitPath({ persona })}`)) {
      missing.add(persona.displayName);
    }
  }
  expect([...missing].sort()).toEqual([...digimonWithoutArtwork].sort());
});
