import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const suspend: Action = {
  kind: "Suspend",
  target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
};

export const compiled: CompiledCard = {
  effects: [
    { trigger: "WhenMoving", actions: [suspend] },
    { trigger: "OnPlay", actions: [suspend] },
    {
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "ModifyDP",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          amount: 5000,
          duration: "forTheTurn",
        },
      ],
    },
    { trigger: "Static", isInherited: true, actions: [], keywords: [{ keyword: "Piercing" }] },
  ],
  digivolutionRequirement: [
    { namesExact: ["Gammamon"], cost: 2, isAlternate: true },
    { level: 3, traits: ["VB"], cost: 2, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-047", compiled);
