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
      trigger: "OnPlay",
      actions: [
        {
          effectTextPart: "[On Play] [When Digivolving] This Digimon gets +3000 DP until your opponent's turn ends.",
          kind: "ModifyDP",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          amount: 3000,
          duration: "untilOpponentTurnEnd",
        },
        {
          kind: "Modal",
          choose: 1,
          labels: ["Play a Glowing Dawn card", "Use a Glowing Dawn Option"],
          options: [
            [
              {
                kind: "PlayWithoutCost",
                target: {
                  filter: {
                    controller: "mine",
                    kind: ["Digimon", "Tamer"],
                    nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
                  },
                  count: 1,
                },
                from: ["hand"],
                payCost: true,
                reduceCostBy: 3,
              },
            ],
            [
              {
                kind: "UseOptionWithoutCost",
                filter: {
                  controller: "mine",
                  kind: ["Option"],
                  nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
                },
                from: ["hand"],
                payCost: true,
                reduceCostBy: 3,
              },
            ],
          ],
          condition: {
            kind: "isYourTurn",
            raw: "it's your turn",
          },
          cost: {
            kind: "trashBottomFaceDownUnderTamer",
            target: {
              filter: {
                controller: "mine",
                kind: ["Tamer"],
              },
              count: 1,
            },
            raw: "by trashing the bottom face-down card from under any of your Tamers",
          },
          optional: true,
          abortOnDecline: true,
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart: "[On Play] [When Digivolving] This Digimon gets +3000 DP until your opponent's turn ends.",
          kind: "ModifyDP",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          amount: 3000,
          duration: "untilOpponentTurnEnd",
        },
        {
          kind: "Modal",
          choose: 1,
          labels: ["Play a Glowing Dawn card", "Use a Glowing Dawn Option"],
          options: [
            [
              {
                kind: "PlayWithoutCost",
                target: {
                  filter: {
                    controller: "mine",
                    kind: ["Digimon", "Tamer"],
                    nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
                  },
                  count: 1,
                },
                from: ["hand"],
                payCost: true,
                reduceCostBy: 3,
              },
            ],
            [
              {
                kind: "UseOptionWithoutCost",
                filter: {
                  controller: "mine",
                  kind: ["Option"],
                  nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
                },
                from: ["hand"],
                payCost: true,
                reduceCostBy: 3,
              },
            ],
          ],
          condition: {
            kind: "isYourTurn",
            raw: "it's your turn",
          },
          cost: {
            kind: "trashBottomFaceDownUnderTamer",
            target: {
              filter: {
                controller: "mine",
                kind: ["Tamer"],
              },
              count: 1,
            },
            raw: "by trashing the bottom face-down card from under any of your Tamers",
          },
          optional: true,
          abortOnDecline: true,
        },
      ],
    },
    {
      trigger: "EndOfAttack",
      actions: [
        {
          kind: "Unsuspend",
          target: {
            filter: {
              isSelfRef: true,
              nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
            },
            count: 1,
            isSelf: true,
          },
          cost: {
            kind: "trashBottomFaceDownUnderTamer",
            target: {
              filter: {
                controller: "mine",
                kind: ["Tamer"],
              },
              count: 1,
            },
            raw: "By trashing the bottom face-down card from under any of your Tamers",
          },
          optional: true,
          abortOnDecline: true,
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
      level: 4,
      traits: ["Glowing Dawn"],
      cost: 3,
      isAlternate: true,
    },
  ],
};

registerIrCard("ST23-08", compiled);
