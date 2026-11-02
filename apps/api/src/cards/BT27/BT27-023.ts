import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const protect: Action = {
  kind: "Restrict",
  target: {
    filter: {
      controller: "mine",
      kind: ["Digimon"],
      nameOrTrait: [
        { tokens: ["Gammamon"], match: "text" },
        { tokens: ["VB"], match: "trait" },
      ],
    },
    count: 1,
  },
  restriction: "beDeletedInBattle",
  duration: "forTheTurn",
};

export const compiled: CompiledCard = {
  effects: [
    { trigger: "WhenMoving", actions: [protect] },
    { trigger: "OnPlay", actions: [protect] },
    {
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Restrict",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 5 } },
            count: 1,
          },
          restriction: "suspend",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    { trigger: "Static", isInherited: true, actions: [], keywords: [{ keyword: "Evade" }] },
  ],
  digivolutionRequirement: [
    { namesExact: ["Gammamon"], cost: 2, isAlternate: true },
    { level: 3, traits: ["VB"], cost: 2, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-023", compiled);
