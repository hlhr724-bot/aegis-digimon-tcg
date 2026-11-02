import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldDigivolve",
          sourceFilter: { isSelfRef: true },
          into: { kind: ["Digimon"], colors: ["Purple"], nameOrTrait: [{ tokens: ["BEATBREAK"], match: "trait" }] },
          actions: [{ kind: "Replacement", event: "wouldDigivolve", mode: "reduceCost", amount: 1 }],
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        { kind: "Draw", effectTextPart: "[When Attacking] [Once Per Turn] ＜Draw 1＞", controller: "mine", amount: 1 },
        {
          kind: "Trash",
          effectTextPart: "and trash 1 card in your hand.",
          target: { filter: { controller: "mine", zone: "hand" }, count: 1 },
        },
      ],
    },
  ],
  digivolutionRequirement: [{ level: 2, traits: ["Glowing Dawn"], cost: 0, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-073", compiled);
