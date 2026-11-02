import type { Action, CompiledCard, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const target: Target = {
  filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 5 } },
  count: 1,
  bindAs: "fullMoonTarget",
};

const mainActions: Action[] = [
  {
    effectTextPart:
      "[Main] Return 1 of your opponent's level 5 or lower Digimon to its owner's hand. If your opponent has 8 or more cards in their hand, instead return 1 of your opponent's level 5 or lower Digimon to the bottom of its owner's deck. Trash all of the digivolution cards of that Digimon.",
    kind: "SelectBind",
    target,
  },
  {
    effectTextPart:
      "[Main] Return 1 of your opponent's level 5 or lower Digimon to its owner's hand. If your opponent has 8 or more cards in their hand, instead return 1 of your opponent's level 5 or lower Digimon to the bottom of its owner's deck. Trash all of the digivolution cards of that Digimon.",
    kind: "Return",
    target: { filter: {}, count: 1, fromSelectionRef: "fullMoonTarget" },
    to: "deckBottom",
    condition: { kind: "zoneCount", seat: "opponent", zone: "hand", op: "gte", value: 8 },
  },
  {
    effectTextPart:
      "[Main] Return 1 of your opponent's level 5 or lower Digimon to its owner's hand. If your opponent has 8 or more cards in their hand, instead return 1 of your opponent's level 5 or lower Digimon to the bottom of its owner's deck. Trash all of the digivolution cards of that Digimon.",
    kind: "Return",
    target: { filter: {}, count: 1, fromSelectionRef: "fullMoonTarget" },
    to: "hand",
    condition: { kind: "zoneCount", seat: "opponent", zone: "hand", op: "lt", value: 8 },
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Main", actions: mainActions },
    { trigger: "Security", actions: mainActions, isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT4-103", compiled);
