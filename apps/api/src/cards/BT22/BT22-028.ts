import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "Decode",
          raw: "＜Decode (Lv.6 or lower w/[Aqua]/[Sea Animal] in any trait)＞",
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
                  levelComparison: { op: "lte", value: 6 },
                  nameOrTrait: [{ tokens: ["Aqua", "Sea Animal"], match: "traitContains" }],
                },
                count: 1,
              },
              fromOwnDigivolutionStack: true,
              payCost: false,
              playedByDecode: true,
              optional: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      optional: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              levels: [3],
              nameOrTrait: [
                {
                  tokens: ["Aqua"],
                  match: "traitContains",
                },
              ],
            },
            orFilters: [
              {
                controller: "mine",
                kind: ["Digimon"],
                levels: [3],
                nameOrTrait: [
                  {
                    tokens: ["Sea Animal"],
                    match: "traitContains",
                  },
                ],
              },
            ],
            count: 1,
          },
          additionalSimultaneousTargets: [
            {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
                levels: [4],
                nameOrTrait: [
                  {
                    tokens: ["Aqua"],
                    match: "traitContains",
                  },
                ],
              },
              orFilters: [
                {
                  controller: "mine",
                  kind: ["Digimon"],
                  levels: [4],
                  nameOrTrait: [
                    {
                      tokens: ["Sea Animal"],
                      match: "traitContains",
                    },
                  ],
                },
              ],
              count: 1,
            },
            {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
                levels: [5],
                nameOrTrait: [
                  {
                    tokens: ["Aqua"],
                    match: "traitContains",
                  },
                ],
              },
              orFilters: [
                {
                  controller: "mine",
                  kind: ["Digimon"],
                  levels: [5],
                  nameOrTrait: [
                    {
                      tokens: ["Sea Animal"],
                      match: "traitContains",
                    },
                  ],
                },
              ],
              count: 1,
            },
          ],
          fromOwnDigivolutionStack: true,
          payCost: false,
          optional: false,
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Return",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          to: "deckBottom",
          cost: {
            kind: "place",
            targetIsPermanent: true,
            target: {
              filter: {
                controller: "mine",
                excludeSelf: true,
                kind: ["Digimon"],
              },
              count: 1,
            },
            raw: "By placing 1 of your other Digimon as this Digimon's bottom digivolution card",
            destination: "digivolutionStack",
            position: "bottom",
            host: "self",
          },
          optional: true,
          abortOnDecline: true,
        },
        {
          kind: "Unsuspend",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
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
          kind: "Return",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          to: "deckBottom",
          cost: {
            kind: "place",
            targetIsPermanent: true,
            target: {
              filter: {
                controller: "mine",
                excludeSelf: true,
                kind: ["Digimon"],
              },
              count: 1,
            },
            raw: "By placing 1 of your other Digimon as this Digimon's bottom digivolution card",
            destination: "digivolutionStack",
            position: "bottom",
            host: "self",
          },
          optional: true,
          abortOnDecline: true,
        },
        {
          kind: "Unsuspend",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      namesExact: ["MarineBullmon"],
      cost: 6,
      controllerControls: {
        kind: ["Tamer"],
        namesExact: ["Yao Qinglan"],
        min: 1,
      },
      isAlternate: true,
    },
  ],
};

registerIrCard("BT22-028", compiled);
