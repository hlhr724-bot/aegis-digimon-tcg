import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const playTomoro: CardEffect["actions"] = [
  {
    kind: "PlayWithoutCost",
    target: {
      filter: { controller: "mine", kind: ["Tamer"], nameOrTrait: [{ tokens: ["Tomoro Tenma"], match: "name" }] },
      count: 1,
    },
    from: ["hand"],
    payCost: false,
    optional: true,
  },
];
const tamerLimit: CardEffect["condition"] = { kind: "youHave", filter: { kind: ["Tamer"], countMax: 1 } };

export const compiled: CompiledCard = {
  effects: [
    { trigger: "WhenDigivolving", condition: tamerLimit, actions: playTomoro },
    { trigger: "Security", isSecurity: true, condition: tamerLimit, actions: playTomoro },
    { trigger: "Static", isInherited: true, actions: [], keywords: [{ keyword: "Piercing" }] },
  ],
  digivolutionRequirement: [{ level: 3, traits: ["Glowing Dawn"], cost: 2, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-046", compiled);
