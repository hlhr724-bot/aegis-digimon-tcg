import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const battle: Action = {
  kind: "Battle",
  effectTextPart: "[On Play] [When Digivolving] This Digimon may battle 1 of your opponent's Digimon.",
  attacker: { filter: { isSelfRef: true }, count: 1, isSelf: true },
  target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
  optional: true,
};

const recovery: Action = {
  kind: "SecurityManipulation",
  effectTextPart: "[On Deletion] ＜Recovery +1＞",
  op: "addTop",
  controller: "mine",
  source: "deck",
  amount: 1,
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Fortitude", raw: "＜Fortitude＞" }],
    },
    { trigger: "OnPlay", actions: [battle] },
    { trigger: "WhenDigivolving", actions: [battle] },
    { trigger: "OnDeletion", actions: [recovery] },
    { trigger: "OnDeletion", isInherited: true, actions: [recovery] },
  ],
  digivolutionRequirement: [
    { level: 4, names: ["Leomon"], cost: 3, isAlternate: true },
    { level: 4, traits: ["Holy Beast", "ACCEL"], cost: 3, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-051", compiled);
