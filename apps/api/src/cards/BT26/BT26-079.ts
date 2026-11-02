import type { Action, CompiledCard, Filter, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const plutomon: Filter = {
  controller: "mine",
  zone: "trash",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Plutomon"], match: "nameExact" }],
};
const deleteLevel6: Action = {
  kind: "CostGatedBlock",
  cost: { kind: "trash", target: { filter: { controller: "mine", zone: "hand" }, count: 1 } },
  optional: true,
  abortOnDecline: true,
  actions: [
    {
      kind: "Delete",
      target: {
        filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 6 } },
        count: 1,
      },
    },
  ],
};
const decode: Action = {
  kind: "Replacement",
  event: "wouldLeavePlay",
  mode: "instead",
  leaveCause: "otherThanBattle",
  sourceFilter: { isSelfRef: true },
  actions: [
    {
      kind: "PlayWithoutCost",
      target: { filter: plutomon, count: 1 },
      fromOwnDigivolutionStack: true,
      payCost: false,
      playedByDecode: true,
      optional: true,
    },
  ],
};
const trimHands: Action[] = [
  { kind: "Trash", target: { filter: { controller: "mine", zone: "hand" }, count: "all", untilHandSize: 4 } },
  {
    kind: "Trash",
    target: { filter: { controller: "opponent", zone: "hand" }, count: "all", untilHandSize: 4 },
    chooser: "opponent",
  },
];

export const compiled: CompiledCard = {
  keywords: [
    { keyword: "SecurityAttack", amount: 1, raw: "＜Security A. +1＞" },
    { keyword: "Retaliation", raw: "＜Retaliation＞" },
    { keyword: "Decode", raw: "＜Decode ([Plutomon])＞" },
  ],
  effects: [
    { trigger: "Static", actions: [decode] },
    {
      trigger: "Main",
      isFromTrash: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          target: self,
          from: ["trash"],
          payCost: true,
          reduceCostBy: 4,
          assembly: {
            target: {
              filter: {
                controller: "mine",
                zone: "trash",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Plutomon"], match: "nameExact" }],
              },
              count: 1,
            },
            reduceCostBy: 2,
          },
          condition: { kind: "handAtMost", value: 5 },
        },
      ],
    },
    { trigger: "OnPlay", actions: [deleteLevel6] },
    { trigger: "WhenDigivolving", actions: [deleteLevel6] },
    { trigger: "WhenAttacking", actions: [deleteLevel6] },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      sharedUseKey: "bt26-079-hand-trim",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: { controller: "opponent", kind: ["Digimon"] },
          actions: trimHands,
        },
        {
          kind: "SubTrigger",
          event: "whenAnyDigivolves",
          sourceFilter: { controller: "opponent", kind: ["Digimon"] },
          actions: trimHands,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { namesExact: ["Plutomon"], cost: 1, isAlternate: true },
    { level: 5, traits: ["TS"], cost: 3, isAlternate: true },
  ],
  assemblyRequirement: [{ reduceCost: 2, materials: [{ namesExact: ["Plutomon"], count: 1 }] }],
};

registerIrCard("BT26-079", compiled);
export default compiled;
