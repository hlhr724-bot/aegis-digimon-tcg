import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "Alliance",
          raw: "＜Alliance＞",
        },
      ],
    },
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "Piercing",
          raw: "＜Piercing＞",
        },
      ],
    },
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "Blocker",
          raw: "＜Blocker＞",
        },
      ],
    },
    {
      trigger: "OnPlay",
      actions: [
        {
          effectTextPart: "[On Play] [When Digivolving] ＜De-Digivolve 3＞ 1 of your opponent's Digimon.",
          kind: "DeDigivolve",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: 3,
        },
        {
          kind: "GrantStatic",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          grant: "immuneToOpponentDigimonEffects",
          duration: "untilOpponentTurnEnd",
        },
        {
          kind: "GrantStatic",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Garurumon"],
                  match: "name",
                },
              ],
            },
            count: 1,
          },
          grant: "immuneToOpponentDigimonEffects",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart: "[On Play] [When Digivolving] ＜De-Digivolve 3＞ 1 of your opponent's Digimon.",
          kind: "DeDigivolve",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: 3,
        },
        {
          kind: "GrantStatic",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          grant: "immuneToOpponentDigimonEffects",
          duration: "untilOpponentTurnEnd",
        },
        {
          kind: "GrantStatic",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Garurumon"],
                  match: "name",
                },
              ],
            },
            count: 1,
          },
          grant: "immuneToOpponentDigimonEffects",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "EndOfYourTurn",
      actions: [
        {
          effectTextPart: "[End of Your Turn] 2 of your Digimon may DNA digivolve into [Omnimon Alter-S] in the hand.",
          kind: "DnaDigivolve",
          materials: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 2,
          },
          into: {
            controllerDefault: "mine",
            nameOrTrait: [
              {
                tokens: ["Omnimon Alter-S"],
                match: "nameExact",
              },
            ],
          },
          payCost: true,
          optional: true,
        },
        {
          effectTextPart: "Then, 1 of your Digimon may attack.",
          kind: "Attack",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
          },
          withoutSuspending: false,
          optional: true,
        },
      ],
    },
    {
      trigger: "Static",
      actions: [],
      isInherited: true,
      keywords: [
        {
          keyword: "SecurityAttack",
          amount: 1,
          raw: "＜Security Attack +1＞",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  assemblyRequirement: [
    {
      reduceCost: 4,
      materials: [
        { count: 1, kinds: ["Digimon"], namesExact: ["MetalGreymon: Alterous Mode"] },
        { count: 1, kinds: ["Digimon"], namesExact: ["Greymon"] },
      ],
    },
  ],
  digivolutionRequirement: [
    {
      level: 5,
      names: ["Greymon"],
      cost: 3,
      isAlternate: true,
    },
    {
      traits: ["ADVENTURE"],
      cost: 3,
      isAlternate: true,
      level: 5,
    },
  ],
};

registerIrCard("AD1-009", compiled);
