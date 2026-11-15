import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const boostThenDraw: Action[] = [
  {
    kind: "ModifyDP",
    effectTextPart: "1 of your Digimon gets +3000 DP for the turn.",
    target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
    amount: 3000,
    duration: "forTheTurn",
  },
  {
    kind: "Draw",
    effectTextPart: "Then, if you have a Digimon with 8000 DP or more, ＜Draw 1＞.",
    controller: "mine",
    amount: 1,
    condition: {
      kind: "youHave",
      filter: { controllerDefault: "mine", kind: ["Digimon"], dp: { op: "gte", value: 8000 } },
      raw: "you have a Digimon with 8000 DP or more",
    },
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Raid", raw: "＜Raid＞" }] },
    { trigger: "WhenMoving", actions: boostThenDraw },
    { trigger: "WhenDigivolving", actions: boostThenDraw },
    { trigger: "Static", isInherited: true, actions: [], keywords: [{ keyword: "Raid", raw: "＜Raid＞" }] },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 3, texts: ["Gemmon"], cost: 2, isAlternate: true }],
};

registerIrCard("BT27-011", compiled);
