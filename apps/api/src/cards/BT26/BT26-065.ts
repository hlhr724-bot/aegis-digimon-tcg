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
              effectTextPart: "Add 1 [Keenan Crier] or card with the [DATA SQUAD] trait",
              filter: {
                nameOrTrait: [
                  { tokens: ["Keenan Crier"], match: "nameExact" },
                  { tokens: ["DATA SQUAD"], match: "trait" },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart:
                "1 purple card with [Ravemon] in its name or [Avian] or [Bird] in any of its traits among them to the hand.",
              filter: {
                colors: ["Purple"],
                nameOrTrait: [
                  { tokens: ["Ravemon"], match: "name" },
                  { tokens: ["Avian"], match: "traitContains" },
                  { tokens: ["Bird"], match: "traitContains" },
                ],
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
        { kind: "Draw", controller: "mine", amount: 1 },
        { kind: "Trash", target: { count: 1, filter: { controller: "mine", zone: "hand" } }, optional: false },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 2, traits: ["DATA SQUAD"], cost: 0, isAlternate: true }],
};
registerIrCard("BT26-065", compiled);
