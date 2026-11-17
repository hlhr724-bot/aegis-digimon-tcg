import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const iceSnowDigimon: Filter = {
  controller: "mine",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Ice-Snow"], match: "trait" }],
};

const trashBottomTwoThenGainMemory: Action[] = [
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
          "by suspending this Tamer, trash the bottom 2 digivolution cards from 1 of your opponent's Digimon.",
        target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
        amount: 2,
        fromTop: false,
      },
      {
        kind: "GainMemory",
        effectTextPart: "After, if they don't have a Digimon with digivolution cards, gain 1 memory.",
        amount: 1,
        condition: {
          kind: "opponentHasNone",
          filter: { digivolutionCards: "hasAny", controllerDefault: "opponent", kind: ["Digimon"] },
          raw: "they don't have a Digimon with digivolution cards",
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
              nameOrTrait: [{ tokens: ["Ice-Snow"], match: "trait" }],
            },
            raw: "you have a Digimon with the [Ice-Snow] trait",
          },
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: iceSnowDigimon,
          actions: trashBottomTwoThenGainMemory,
        },
        {
          kind: "SubTrigger",
          event: "whenOneOfYoursDigivolves",
          sourceFilter: iceSnowDigimon,
          actions: trashBottomTwoThenGainMemory,
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

registerIrCard("BT27-088", compiled);
