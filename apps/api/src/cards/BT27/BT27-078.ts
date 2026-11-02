import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const playKeenan: Action[] = [
  {
    kind: "PlayWithoutCost",
    condition: { kind: "youHave", filter: { kind: ["Tamer"], countMax: 1 } },
    target: {
      filter: { controller: "mine", kind: ["Tamer"], nameOrTrait: [{ tokens: ["Keenan Crier"], match: "nameExact" }] },
      count: 1,
    },
    from: ["hand"],
    payCost: false,
    optional: true,
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "OnPlay", actions: playKeenan },
    { trigger: "WhenDigivolving", actions: playKeenan },
    {
      trigger: "OnDeletion",
      isInherited: true,
      actions: [
        { kind: "Trash", target: { filter: { controller: "opponent", zone: "hand" }, count: 1 }, chooser: "opponent" },
      ],
    },
  ],
  digivolutionRequirement: [{ level: 3, traits: ["DATA SQUAD"], cost: 2, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-078", compiled);
