import { describe, expect, it } from "vitest";
import { requireCardDefinition } from "#shared/cards/registry";

describe("BT27 and EX14 preview colors", () => {
  it.each([
    {
      cardId: "BT27-035",
      colors: ["Blue", "Black"],
      optionColors: ["Blue"],
      evolutionColors: ["Blue"],
      level: 6,
      cost: 5,
    },
    { cardId: "BT27-070", colors: ["Black"], optionColors: ["Black"], evolutionColors: ["Black"], level: 5, cost: 4 },
    {
      cardId: "BT27-084",
      colors: ["Purple", "Black"],
      optionColors: ["Purple", "Black"],
      evolutionColors: ["Purple", "Black"],
      level: 5,
      cost: 4,
    },
    { cardId: "BT27-100", colors: ["Black"], optionColors: undefined, evolutionColors: [], level: 0, cost: 0 },
    {
      cardId: "BT27-085",
      colors: ["Purple", "Green"],
      optionColors: ["Purple"],
      evolutionColors: ["Purple", "Green"],
      level: 6,
      cost: 5,
    },
    {
      cardId: "BT27-103",
      colors: ["Black", "Yellow", "Red"],
      optionColors: ["Black"],
      evolutionColors: ["Black", "Yellow", "Red"],
      level: 6,
      cost: 6,
    },
    { cardId: "EX14-012", colors: ["Red"], optionColors: ["Red"], evolutionColors: ["Red"], level: 5, cost: 3 },
    {
      cardId: "EX14-054",
      colors: ["Purple", "Red"],
      optionColors: undefined,
      evolutionColors: ["Purple", "Red"],
      level: 5,
      cost: 4,
    },
  ])(
    "matches the printed colors and evolution requirements of $cardId",
    ({ cardId, colors, optionColors, evolutionColors, level, cost }) => {
      const card = requireCardDefinition(cardId);
      expect(card.colors).toEqual(colors);
      expect(card.optionColorRequirements).toEqual(optionColors);
      expect(card.evoCosts).toEqual(evolutionColors.map((color) => ({ color, level, memoryCost: cost })));
    },
  );
});
