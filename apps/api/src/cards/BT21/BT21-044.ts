import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "SelectBind",
          target: {
            filter: {
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Marcus Damon"],
                  match: "nameExact",
                },
              ],
            },
            count: 1,
            bindAs: "bt21-044-marcus",
          },
        },
        {
          kind: "GrantStatic",
          target: { filter: {}, count: 1, fromSelectionRef: "bt21-044-marcus" },
          grant: "kinds",
          tokens: ["Digimon"],
          duration: "forTheTurn",
        },
        {
          kind: "SetBaseDP",
          target: { filter: {}, count: 1, fromSelectionRef: "bt21-044-marcus" },
          value: 3000,
          duration: "forTheTurn",
        },
        {
          kind: "Restrict",
          target: { filter: {}, count: 1, fromSelectionRef: "bt21-044-marcus" },
          restriction: "digivolve",
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "[On Play] [When Digivolving] For the turn, 1 of your [Marcus Damon]s is also treated as a 3000 DP Digimon, can't digivolve, and gains ＜Rush＞ and ＜Alliance＞.",
          kind: "GainKeyword",
          target: { filter: {}, count: 1, fromSelectionRef: "bt21-044-marcus" },
          keyword: {
            keyword: "Rush",
            raw: "＜Rush＞",
          },
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "[On Play] [When Digivolving] For the turn, 1 of your [Marcus Damon]s is also treated as a 3000 DP Digimon, can't digivolve, and gains ＜Rush＞ and ＜Alliance＞.",
          kind: "GainKeyword",
          target: { filter: {}, count: 1, fromSelectionRef: "bt21-044-marcus" },
          keyword: {
            keyword: "Alliance",
            raw: "＜Alliance＞",
          },
          duration: "forTheTurn",
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
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "SelectBind",
          target: {
            filter: {
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Marcus Damon"],
                  match: "nameExact",
                },
              ],
            },
            count: 1,
            bindAs: "bt21-044-marcus",
          },
        },
        {
          kind: "GrantStatic",
          target: { filter: {}, count: 1, fromSelectionRef: "bt21-044-marcus" },
          grant: "kinds",
          tokens: ["Digimon"],
          duration: "forTheTurn",
        },
        {
          kind: "SetBaseDP",
          target: { filter: {}, count: 1, fromSelectionRef: "bt21-044-marcus" },
          value: 3000,
          duration: "forTheTurn",
        },
        {
          kind: "Restrict",
          target: { filter: {}, count: 1, fromSelectionRef: "bt21-044-marcus" },
          restriction: "digivolve",
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "[On Play] [When Digivolving] For the turn, 1 of your [Marcus Damon]s is also treated as a 3000 DP Digimon, can't digivolve, and gains ＜Rush＞ and ＜Alliance＞.",
          kind: "GainKeyword",
          target: { filter: {}, count: 1, fromSelectionRef: "bt21-044-marcus" },
          keyword: {
            keyword: "Rush",
            raw: "＜Rush＞",
          },
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "[On Play] [When Digivolving] For the turn, 1 of your [Marcus Damon]s is also treated as a 3000 DP Digimon, can't digivolve, and gains ＜Rush＞ and ＜Alliance＞.",
          kind: "GainKeyword",
          target: { filter: {}, count: 1, fromSelectionRef: "bt21-044-marcus" },
          keyword: {
            keyword: "Alliance",
            raw: "＜Alliance＞",
          },
          duration: "forTheTurn",
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
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          sourceFilter: {
            controller: "mine",
            kind: ["Tamer"],
            colors: ["Red", "Yellow"],
          },
          actions: [
            {
              kind: "SecurityManipulation",
              op: "placeAsSecurity",
              controller: "mine",
              source: {
                filter: {
                  controllerDefault: "mine",
                  nameOrTrait: [
                    {
                      tokens: ["Marcus Damon"],
                      match: "nameExact",
                    },
                  ],
                },
                count: 1,
              },
              from: ["trash"],
              toTop: true,
              optional: true,
            },
          ],
          raw: "onDeletionOf",
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "bt21-044-marcus-security",
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          sourceFilter: {
            controller: "mine",
            kind: ["Tamer"],
            colors: ["Red", "Yellow"],
          },
          actions: [
            {
              kind: "SecurityManipulation",
              op: "placeAsSecurity",
              controller: "mine",
              source: {
                filter: {
                  controllerDefault: "mine",
                  nameOrTrait: [
                    {
                      tokens: ["Marcus Damon"],
                      match: "nameExact",
                    },
                  ],
                },
                count: 1,
              },
              from: ["trash"],
              toTop: true,
              optional: true,
            },
          ],
          raw: "onDeletionOf",
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      namesExact: ["GeoGreymon"],
      cost: 3,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT21-044", compiled);
