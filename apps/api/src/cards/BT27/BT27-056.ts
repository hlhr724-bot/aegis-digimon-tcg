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
          into: { kind: ["Digimon"], colors: ["Black"], nameOrTrait: [{ tokens: ["BEATBREAK"], match: "trait" }] },
          actions: [{ kind: "Replacement", event: "wouldDigivolve", mode: "reduceCost", amount: 1 }],
        },
      ],
    },
    { trigger: "Static", isInherited: true, actions: [], keywords: [{ keyword: "Reboot" }] },
  ],
  digivolutionRequirement: [{ level: 2, traits: ["Glowing Dawn"], cost: 0, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-056", compiled);
