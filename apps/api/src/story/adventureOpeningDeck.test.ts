import { expect, it } from "vitest";
import { catalogStoryBattles } from "@aegis/shared/story/catalogStoryBattles";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import { validateDecklist } from "#api/engine/deckValidation";
import "#api/cards/index";

it("gives the Greymon versus Shellmon opening the Agumon evolution line", () => {
  const battle = catalogStoryBattles.find((entry) => entry.id === "ad01")!;
  const fixture = getStoryScenario(battle.id)!;
  const player = getStorySeatDeck({ fixture, seat: 0 });
  const names = player.mainDeck.map((card) => getCardDefinition(card)?.nameEn);
  expect(names).toEqual(expect.arrayContaining(["Agumon", "Greymon", "MetalGreymon", "WarGreymon", "Tai Kamiya"]));
  expect(names).not.toContain("Metal Empire");
  expect(validateDecklist(player, { betaBattleMode: false })).toEqual({ ok: true });
  const opponent = getStorySeatDeck({ fixture, seat: 1 });
  expect(opponent.mainDeck.some((card) => getCardDefinition(card)?.nameEn === "Shellmon")).toBe(true);
});
