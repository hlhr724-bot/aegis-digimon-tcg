import type { Action, CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const handDigimon: Filter = { controller: "mine", zone: "hand", kind: ["Digimon"] };
const myotismonText: Filter = { nameOrTrait: [{ tokens: ["Myotismon"], match: "text" }] };
const body: Action[] = [
  {
    effectTextPart:
      "[Main] By trashing 1 Digimon card in your hand, delete 1 of your opponent's Digimon whose level is less than or equal to the trashed card's level. When a card with [Myotismon] in its text is trashed by this effect, ＜Draw 2＞ (Draw 2 cards from your deck).",
    kind: "CostGatedBlock",
    cost: { kind: "trash", target: { filter: handDigimon, count: 1 }, storeAs: "trashedDigimonLevel" },
    optional: true,
    abortOnDecline: true,
    actions: [
      {
        kind: "Delete",
        target: { filter: { controller: "opponent", kind: ["Digimon"], levelLte: "trashedDigimonLevel" }, count: 1 },
      },
      {
        kind: "Draw",
        controller: "mine",
        amount: 2,
        condition: { kind: "lastTrashedMatchesFilter", filter: myotismonText },
      },
    ],
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Main", actions: body },
    { trigger: "Security", actions: body, isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT15-099", compiled);
