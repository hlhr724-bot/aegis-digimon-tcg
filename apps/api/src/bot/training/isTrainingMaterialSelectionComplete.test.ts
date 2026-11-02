import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { isTrainingMaterialSelectionComplete } from "#api/bot/training/isTrainingMaterialSelectionComplete";
import { chooseDecisionIntent, type SelectionCard } from "#api/bot/training/decisions";

describe("training material selection", () => {
  it("continues Assembly through partial selections and only finishes the full different-level recipe", () => {
    const ids = ["BT26-001", "BT26-009", "BT26-011", "BT26-015", "BT26-016"];
    const cards = new Map<string, SelectionCard>(ids.map((cardId) => [cardId, { cardId }]));
    const options = { assemblyCardId: "BT26-085", candidateInstanceIds: ids, min: 0, max: 5 };
    expect(isTrainingMaterialSelectionComplete({ options, cards, selected: ids.slice(0, 4) })).toBe(false);
    expect(isTrainingMaterialSelectionComplete({ options, cards, selected: ids })).toBe(true);
    const result = chooseDecisionIntent(
      { decisionId: "materials", seat: 0, kind: "selectCards", promptText: "Select Assembly materials", options },
      cards,
      () => 0,
    );
    expect(result).toEqual({
      type: "respondDecision",
      decisionId: "materials",
      response: { kind: "selectCards", instanceIds: ids },
    });
  });

  it("permits partial DigiXros recipes and rejects a material outside the recipe", () => {
    const cards = new Map<string, SelectionCard>([
      ["shoutmon", { cardId: "BT10-008" }],
      ["agumon", { cardId: "BT1-010" }],
    ]);
    const options = { digiXrosCardId: "BT10-009" };
    expect(isTrainingMaterialSelectionComplete({ options, cards, selected: [] })).toBe(true);
    expect(isTrainingMaterialSelectionComplete({ options, cards, selected: ["shoutmon"] })).toBe(true);
    expect(isTrainingMaterialSelectionComplete({ options, cards, selected: ["agumon"] })).toBe(false);
  });
});
