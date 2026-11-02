import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const securityDiscardText = "[When Digivolving] Your opponent trashes any 1 card from their hand or security stack.";
const revivalText =
  "[On Deletion] If your opponent's hand has 7 or fewer cards, you may play 1 play cost 7 or lower purple Digimon card with [Avian] or [Bird] in any of its traits from your trash without paying the cost.";
const discardText = "[Main] Your opponent trashes cards in their hand so that they have 7 left.";
const deleteText = "If this effect didn't trash, delete 1 of their Digimon.";

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Blocker" }, { keyword: "Retaliation" }] },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: {
            kind: "youHave",
            filter: { controller: "mine", nameOrTrait: [{ tokens: ["DATA SQUAD"], match: "trait" }] },
          },
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Trash",
          effectTextPart: securityDiscardText,
          target: { filter: { controller: "opponent", zone: ["hand", "security"] }, count: 1 },
          chooser: "opponent",
        },
      ],
    },
    {
      trigger: "OnDeletion",
      condition: { kind: "zoneCount", seat: "opponent", zone: "hand", op: "lte", value: 7 },
      actions: [
        {
          kind: "PlayWithoutCost",
          effectTextPart: revivalText,
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              colors: ["Purple"],
              playCostLte: 7,
              nameOrTrait: [{ tokens: ["Avian", "Bird"], match: "traitContains" }],
            },
            count: 1,
          },
          from: ["trash"],
          payCost: false,
          optional: true,
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          kind: "Trash",
          effectTextPart: discardText,
          target: { filter: { controller: "opponent", zone: "hand" }, count: 1, untilHandSize: 7 },
          chooser: "opponent",
          trackCount: "discarded",
        },
        {
          kind: "Delete",
          effectTextPart: deleteText,
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          condition: { kind: "not", condition: { kind: "namedCountAtLeast", countSource: "discarded", count: 1 } },
        },
      ],
    },
  ],
  digivolutionRequirement: [
    { namesExact: ["Crowmon"], cost: 3, isAlternate: true },
    { level: 5, traits: ["DATA SQUAD"], cost: 3, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-083", compiled);
