import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const iceSnowDigimon: Filter = {
  controller: "mine",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Ice-Snow"], match: "trait" }],
};

const trashBottomTwoThenDraw: Action[] = [
  {
    kind: "CostGatedBlock",
    cost: {
      kind: "suspend",
      optional: true,
      target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
      raw: "by suspending this Tamer",
    },
    optional: true,
    abortOnDecline: true,
    actions: [
      {
        kind: "TrashDigivolution",
        effectTextPart:
          "by suspending this Tamer, trash the bottom 2 digivolution cards of 1 of your opponent's Digimon.",
        target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
        amount: 2,
        fromTop: false,
      },
      {
        kind: "Draw",
        effectTextPart: "After, if your opponent has no Digimon with digivolution cards, ＜Draw 1＞.",
        controller: "mine",
        amount: 1,
        condition: {
          kind: "opponentHasNone",
          filter: { digivolutionCards: "hasAny", controllerDefault: "opponent", kind: ["Digimon"] },
          raw: "your opponent has no Digimon with digivolution cards",
        },
      },
    ],
  },
];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourTurn",
      actions: [{ kind: "SetMemory", value: 3, condition: { kind: "memoryAtMost", value: 2, controller: "mine" } }],
    },
    {
      trigger: "AllTurns",
      actions: [
        { kind: "SubTrigger", event: "whenPlayed", sourceFilter: iceSnowDigimon, actions: trashBottomTwoThenDraw },
        {
          kind: "SubTrigger",
          event: "whenOneOfYoursDigivolves",
          sourceFilter: iceSnowDigimon,
          actions: trashBottomTwoThenDraw,
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

registerIrCard("ST26-06", compiled);
