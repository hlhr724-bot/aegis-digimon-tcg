import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const reducePlayCost: Action = {
  kind: "Replacement",
  event: "wouldBePlayed",
  sourceFilter: { isSelfRef: true },
  actions: [
    {
      kind: "Replacement",
      event: "wouldBePlayed",
      mode: "reduceCost",
      amount: 6,
      raw: "reduce the cost by 6",
      condition: {
        kind: "opponentHas",
        filter: { controllerDefault: "opponent", kind: ["Digimon"], dp: { op: "gte", value: 11000 } },
        raw: "your opponent has a Digimon with 11000 DP or more",
      },
    },
  ],
};

const battle: Action = {
  kind: "Battle",
  effectTextPart:
    "[On Play] [When Digivolving] [When Attacking] [Once Per Turn] This Digimon may battle 1 of your opponent's Digimon.",
  attacker: { filter: { isSelfRef: true }, count: 1, isSelf: true },
  target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
  optional: true,
};

const playOrUseBossOrDataSquad: Action = {
  kind: "PlayWithoutCost",
  effectTextPart:
    "[On Deletion] You may play or use 1 Tamer or Option card with the [Boss] or [DATA SQUAD] trait from your hand without paying the cost.",
  chooseDualMode: true,
  target: {
    filter: {
      controller: "mine",
      kind: ["Tamer", "Option"],
      nameOrTrait: [{ tokens: ["Boss", "DATA SQUAD"], match: "trait" }],
    },
    count: 1,
  },
  from: ["hand"],
  payCost: false,
  optional: true,
};

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [reducePlayCost] },
    {
      trigger: "Static",
      actions: [],
      keywords: [
        { keyword: "Blocker", raw: "＜Blocker＞" },
        { keyword: "Fortitude", raw: "＜Fortitude＞" },
      ],
    },
    { trigger: "OnPlay", frequency: "OncePerTurn", sharedUseKey: "battle", actions: [battle] },
    { trigger: "WhenDigivolving", frequency: "OncePerTurn", sharedUseKey: "battle", actions: [battle] },
    { trigger: "WhenAttacking", frequency: "OncePerTurn", sharedUseKey: "battle", actions: [battle] },
    { trigger: "OnDeletion", actions: [playOrUseBossOrDataSquad] },
  ],
  digivolutionRequirement: [
    { level: 5, names: ["Leomon"], cost: 4, isAlternate: true },
    { level: 5, traits: ["DATA SQUAD"], cost: 4, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-053", compiled);
