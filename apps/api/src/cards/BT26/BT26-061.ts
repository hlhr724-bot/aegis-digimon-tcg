import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 [Glowing Dawn] trait card",
              filter: { nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }] },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 purple [BEATBREAK] trait card among them to the hand.",
              filter: { colors: ["Purple"], nameOrTrait: [{ tokens: ["BEATBREAK"], match: "trait" }] },
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
        { kind: "Draw", controller: "mine", amount: 1 },
        { kind: "Trash", target: { count: 1, filter: { controller: "mine", zone: "hand" } }, optional: false },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 2, traits: ["Glowing Dawn"], cost: 0, isAlternate: true }],
};
registerIrCard("BT26-061", compiled);
