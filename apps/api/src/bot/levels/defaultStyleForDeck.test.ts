import { describe, expect, it } from "vitest";
import { defaultStyleForDeck } from "#api/bot/levels/defaultStyleForDeck";

const deck = { mainDeck: [], eggDeck: [] };

describe("default deck styles", () => {
  it.each(["Security Rush", "Rookie Rush", "Red Hybrid", "AncientGreymon", "Imperialdramon", "Beelzemon"])(
    "uses aggressive for %s",
    (archetype) => {
      expect(defaultStyleForDeck({ deck, archetype })).toBe("aggressive");
    },
  );
  it.each(["Security Control", "Yellow Hybrid", "Mastemon", "Machinedramon", "BlackWarGreymon"])(
    "uses defensive for %s",
    (archetype) => {
      expect(defaultStyleForDeck({ deck, archetype })).toBe("defensive");
    },
  );
  it.each([undefined, "unrecognized", "constructor", "__proto__"])(
    "uses balanced for unknown archetype %s",
    (archetype) => {
      expect(defaultStyleForDeck({ deck, archetype })).toBe("balanced");
    },
  );
});
