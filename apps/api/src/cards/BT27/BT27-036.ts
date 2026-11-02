import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          effectTextPart:
            "[On Play] Reveal the top 3 cards of your deck. Add 1 card with [Chessmon] in its text and 1 [DATA SQUAD] trait card among them to the hand. Return the rest to the bottom of the deck.",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 card with [Chessmon] in its text",
              filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Chessmon"], match: "text" }] },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 [DATA SQUAD] trait card among them to the hand.",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [{ tokens: ["DATA SQUAD"], match: "trait" }],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "ModifyDP",
          effectTextPart: "[When Attacking] [Once Per Turn] 1 of your opponent's Digimon gets -2000 DP for the turn.",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: -2000,
          duration: "forTheTurn",
        },
      ],
    },
  ],
  digivolutionRequirement: [
    { level: 2, texts: ["Chessmon"], cost: 0, isAlternate: true },
    { level: 2, traits: ["DATA SQUAD"], cost: 0, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT27-036", compiled);
