import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Condition } from "@aegis/shared/effects/ir/predicates/conditions";
import { registerIrCard } from "#api/engine/effects/interpreter";

const hostHasGemmonInText: Condition = {
  kind: "selfTopHasText",
  filter: { nameOrTrait: [{ tokens: ["Gemmon"], match: "text" }] },
  raw: "this Digimon has [Gemmon] in its text",
};

const piercingAndBoost: Action[] = [
  {
    kind: "SelectBind",
    effectTextPart: "1 of your Digimon gains ＜Piercing＞ and +3000 DP for the turn.",
    target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1, bindAs: "reptilimonBoostTarget" },
  },
  {
    kind: "GainKeyword",
    keyword: { keyword: "Piercing", raw: "＜Piercing＞" },
    target: { filter: {}, count: 1, fromSelectionRef: "reptilimonBoostTarget" },
    duration: "forTheTurn",
  },
  {
    kind: "ModifyDP",
    amount: 3000,
    duration: "forTheTurn",
    target: { filter: {}, count: 1, fromSelectionRef: "reptilimonBoostTarget" },
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Engage", raw: "＜Engage＞" }] },
    { trigger: "OnPlay", actions: piercingAndBoost },
    { trigger: "WhenDigivolving", actions: piercingAndBoost },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "GainKeyword",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          keyword: { keyword: "Rush", raw: "＜Rush＞" },
          duration: "permanent",
          condition: { kind: "selfDpAtLeast", value: 12000, raw: "this Digimon has 12000 DP or more" },
        },
      ],
    },
    {
      trigger: "YourTurn",
      isInherited: true,
      actions: [
        {
          kind: "GainKeyword",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          keyword: { keyword: "Engage", raw: "＜Engage＞" },
          duration: "permanent",
          condition: hostHasGemmonInText,
        },
      ],
    },
    {
      trigger: "EndOfYourTurn",
      isInherited: true,
      condition: hostHasGemmonInText,
      description: "＜Engage＞: at the end of this turn, this Digimon may attack.",
      actions: [{ kind: "Attack", target: { filter: { isSelfRef: true }, count: 1, isSelf: true }, optional: true }],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 4, texts: ["Gemmon"], cost: 3, isAlternate: true }],
};

registerIrCard("BT27-014", compiled);
