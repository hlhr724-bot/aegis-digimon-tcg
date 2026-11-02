import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

function buildBorrowEffect(trigger: "WhenDigivolving" | "WhenAttacking"): CardEffect {
  return {
    trigger,
    frequency: "OncePerTurn",
    sharedUseKey: "mamemon-deletion",
    actions: [
      {
        kind: "ActivateForeignEffect",
        zone: "digivolutionCards",
        fromTriggers: ["OnDeletion"],
        filter: { kind: ["Digimon"], nameOrTrait: [{ tokens: ["Mamemon"], match: "name" }] },
        count: 1,
        asEffectOf: "this Digimon",
      },
    ],
  };
}

const aura: Action[] = (["Alliance", "Reboot", "Blocker"] as const).map((keyword) => ({
  kind: "GainKeyword",
  target: {
    filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["Mamemon"], match: "name" }] },
    count: "all",
  },
  keyword: { keyword },
  duration: "permanent",
}));

export const compiled: CompiledCard = {
  effects: [
    buildBorrowEffect("WhenDigivolving"),
    buildBorrowEffect("WhenAttacking"),
    { trigger: "AllTurns", actions: aura },
  ],
  digivolutionRequirement: [
    { level: 6, names: ["Mamemon"], excludeTraits: ["X Antibody"], cost: 1, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-072", compiled);
