import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "SecurityAttack",
          amount: 1,
          raw: "＜Security Attack +1＞",
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          leaveCause: "otherThanBattle",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  hostFilter: { isSelfRef: true },
                  levelComparison: { op: "lte", value: 5 },
                  nameOrTrait: [
                    { tokens: ["Agumon", "Greymon"], match: "name" },
                    { tokens: ["ME", "VB"], match: "trait" },
                  ],
                },
                count: 1,
              },
              from: ["digivolutionCards"],
              payCost: false,
              playedByDecode: true,
              optional: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "Decode",
          raw: "＜Decode (Lv.5 or lower w/[Agumon]/[Greymon] in name or w/[ME]/[VB] trait)＞",
        },
      ],
    },
    {
      trigger: "OnPlay",
      actions: [
        {
          effectTextPart:
            "[On Play] [When Digivolving] [When Attacking] [Once Per Turn] ＜De-Digivolve 2＞ 1 of your opponent's Digimon.",
          kind: "DeDigivolve",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: 2,
        },
        {
          effectTextPart: "Then, delete 1 of your opponent's lowest DP Digimon.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "lowestDP",
            },
            count: 1,
          },
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart:
            "[On Play] [When Digivolving] [When Attacking] [Once Per Turn] ＜De-Digivolve 2＞ 1 of your opponent's Digimon.",
          kind: "DeDigivolve",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: 2,
        },
        {
          effectTextPart: "Then, delete 1 of your opponent's lowest DP Digimon.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "lowestDP",
            },
            count: 1,
          },
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          effectTextPart:
            "[On Play] [When Digivolving] [When Attacking] [Once Per Turn] ＜De-Digivolve 2＞ 1 of your opponent's Digimon.",
          kind: "DeDigivolve",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: 2,
        },
        {
          effectTextPart: "Then, delete 1 of your opponent's lowest DP Digimon.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "lowestDP",
            },
            count: 1,
          },
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
    },
    {
      trigger: "Counter",
      actions: [
        {
          effectTextPart:
            "[Counter] [Once Per Turn] 2 of your Digimon may DNA digivolve into [Omnimon] or an [ME] or [VB] trait Digimon card in the hand.",
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
            kind: ["Digimon"],
            nameOrTrait: [
              {
                tokens: ["Omnimon"],
                match: "nameExact",
              },
              {
                tokens: ["ME", "VB"],
                match: "trait",
              },
            ],
            hasDnaDigivolutionRequirement: true,
          },
          payCost: true,
          optional: true,
        },
        {
          effectTextPart: "Then, you may change the attack target to 1 of your Digimon.",
          kind: "RedirectAttack",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
          },
          optional: true,
        },
      ],
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  dnaDigivolveRequirement: [
    {
      cost: 0,
      materials: [
        { color: "Red", level: 5 },
        { color: "Black", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Red", level: 5 },
        { color: "Purple", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 5 },
        { color: "Black", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 5 },
        { color: "Purple", level: 5 },
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
      traits: ["ME", "VB"],
      cost: 3,
      isAlternate: true,
      level: 5,
    },
  ],
  assemblyRequirement: [
    {
      materials: [
        {
          count: 1,
          nameOrTrait: [
            {
              tokens: ["Agumon", "Greymon"],
              match: "name",
            },
            {
              tokens: ["ME", "VB"],
              match: "trait",
            },
          ],
          level: 5,
        },
        {
          count: 1,
          nameOrTrait: [
            {
              tokens: ["Agumon", "Greymon"],
              match: "name",
            },
            {
              tokens: ["ME", "VB"],
              match: "trait",
            },
          ],
          level: 4,
        },
        {
          count: 1,
          nameOrTrait: [
            {
              tokens: ["Agumon", "Greymon"],
              match: "name",
            },
            {
              tokens: ["ME", "VB"],
              match: "trait",
            },
          ],
          level: 3,
        },
      ],
      reduceCost: 6,
    },
  ],
};

registerIrCard("EX12-017", compiled);
