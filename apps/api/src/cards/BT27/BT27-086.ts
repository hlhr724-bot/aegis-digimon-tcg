import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const alysionDigimon: Filter = {
  controller: "mine",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["ALYSION"], match: "trait" }],
};

const boostThenDraw: Action[] = [
  {
    kind: "CostGatedBlock",
    cost: {
      kind: "suspend",
      target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
      raw: "by suspending this Tamer",
    },
    optional: true,
    abortOnDecline: true,
    actions: [
      {
        kind: "ModifyDP",
        effectTextPart: "by suspending this Tamer, 1 of your Digimon gets +3000 DP for the turn.",
        target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
        amount: 3000,
        duration: "forTheTurn",
      },
      {
        kind: "Draw",
        effectTextPart: "After, if you have a Digimon with 8000 DP or more, ＜Draw 1＞.",
        controller: "mine",
        amount: 1,
        condition: {
          kind: "youHave",
          filter: { controllerDefault: "mine", kind: ["Digimon"], dp: { op: "gte", value: 8000 } },
          raw: "you have a Digimon with 8000 DP or more",
        },
      },
    ],
  },
];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "GainMemory",
          amount: 1,
          condition: {
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Gemmon"], match: "text" }],
            },
            raw: "you have a Digimon with [Gemmon] in its text",
          },
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        { kind: "SubTrigger", event: "whenPlayed", sourceFilter: alysionDigimon, actions: boostThenDraw },
        {
          kind: "SubTrigger",
          event: "whenOneOfYoursDigivolves",
          sourceFilter: alysionDigimon,
          actions: boostThenDraw,
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [
        { kind: "PlayWithoutCost", target: { filter: { isSelfRef: true }, count: 1, isSelf: true }, payCost: false },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-086", compiled);
