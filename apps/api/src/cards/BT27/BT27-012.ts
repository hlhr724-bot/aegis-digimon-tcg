import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "ReactivateEffect",
          fromTrigger: "OnDeletion",
          count: 1,
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          cost: { kind: "payMemory", memory: 1 },
          optional: true,
        },
      ],
    },
    {
      trigger: "OnDeletion",
      actions: [
        {
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestLevel" }, count: 1 },
        },
      ],
    },
    {
      trigger: "OnDeletion",
      isInherited: true,
      actions: [{ kind: "SecurityManipulation", op: "trashTop", controller: "opponent", amount: 1 }],
    },
  ],
  digivolutionRequirement: [{ level: 4, traits: ["Flame"], cost: 3, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-012", compiled);
