import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const sharedBody: CompiledCard["effects"][number]["actions"] = [
  {
    kind: "TrashDigivolution",
    effectTextPart:
      "[When Digivolving][When Attacking] You may return 1 2-color card from this Digimon's digivolution cards to the bottom of its owner's deck to trash all of the digivolution cards of 1 of your opponent's Digimon.",
    target: {
      filter: {
        controller: "opponent",
        kind: ["Digimon"],
      },
      count: 1,
    },
    amount: "all",
    abortOnDecline: true,
    cost: {
      kind: "return",
      target: {
        filter: {
          controller: "mine",
          zone: "digivolutionCards",
          isSelfRef: true,
          multicolor: true,
        },
        count: 1,
      },
      to: "deckBottom",
    },
    optional: true,
  },
  {
    kind: "Return",
    effectTextPart:
      "Then, return all of your opponent's Digimon with no digivolution cards to the bottom of their owners' decks in any order.",
    target: {
      filter: {
        controller: "opponent",
        kind: ["Digimon"],
        digivolutionCards: "none",
      },
      count: "all",
    },
    to: "deckBottom",
    order: "any",
  },
];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "BeforePayCost",
      actions: [
        {
          kind: "Replacement",
          event: "wouldDigivolve",
          into: { cardId: "BT8-112" },
          actions: [
            {
              kind: "Replacement",
              event: "wouldDigivolve",
              mode: "reduceCost",
              amount: 4,
              cost: {
                kind: "return",
                target: {
                  filter: { zone: "trash", controller: "mine", kind: ["Digimon"], levels: [7], colors: ["White"] },
                  count: 1,
                },
                to: "deckBottom",
              },
            },
          ],
        },
      ],
    },
    { trigger: "WhenDigivolving", actions: sharedBody },
    { trigger: "WhenAttacking", actions: sharedBody },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT8-112", compiled);
