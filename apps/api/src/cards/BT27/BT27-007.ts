import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      optional: true,
      cost: {
        kind: "trash",
        target: {
          filter: { controller: "mine", zone: "hand", nameOrTrait: [{ tokens: ["Flame", "Machine"], match: "trait" }] },
          count: 1,
        },
      },
      actions: [
        { kind: "Draw", controller: "mine", amount: 1 },
        { kind: "GainMemory", amount: 1 },
      ],
    },
    {
      trigger: "Rule",
      actions: [
        {
          kind: "GrantStatic",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          grant: "trait",
          tokens: ["Flame"],
          duration: "permanent",
        },
      ],
    },
    {
      trigger: "OnDeletion",
      isInherited: true,
      actions: [
        {
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 6000 } }, count: 1 },
        },
      ],
    },
  ],
  digivolutionRequirement: [{ level: 2, traits: ["Flame"], cost: 0, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-007", compiled);
