import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const drawAndTrash: Action[] = [
  { kind: "Draw", controller: "mine", amount: 1 },
  { kind: "Trash", target: { filter: { controller: "mine", zone: "hand" }, count: 1 } },
];
const placeThenDraw: Action[] = [
  {
    kind: "CostGatedBlock",
    optional: true,
    abortOnDecline: true,
    cost: {
      kind: "place",
      target: { filter: { controller: "mine", zone: "hand" }, count: 1, from: ["hand"] },
      destination: "digivolutionStack",
      host: {
        filter: {
          controller: "mine",
          kind: ["Tamer"],
          nameOrTrait: [{ tokens: ["Keenan Crier"], match: "nameExact" }],
        },
        count: 1,
      },
      faceDownUnderTamer: true,
      raw: "By placing 1 card from your hand face down under any of your [Keenan Crier]s",
    },
    actions: drawAndTrash,
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "WhenMoving", actions: placeThenDraw },
    { trigger: "OnPlay", actions: placeThenDraw },
    { trigger: "WhenAttacking", isInherited: true, frequency: "OncePerTurn", actions: drawAndTrash },
  ],
  digivolutionRequirement: [{ level: 2, traits: ["DATA SQUAD"], cost: 0, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-074", compiled);
