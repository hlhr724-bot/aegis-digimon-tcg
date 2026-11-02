import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 5,
              },
            },
            count: 1,
          },
        },
        {
          kind: "Trash",
          blind: true,
          target: {
            count: 1,
            filter: {
              controller: "opponent",
              zone: "hand",
            },
          },
          condition: {
            kind: "ifThisEffectDidNotAct",
            raw: "you didn't",
          },
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 5,
              },
            },
            count: 1,
          },
        },
        {
          kind: "Trash",
          blind: true,
          target: {
            count: 1,
            filter: {
              controller: "opponent",
              zone: "hand",
            },
          },
          condition: {
            kind: "ifThisEffectDidNotAct",
            raw: "you didn't",
          },
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "Aura",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          effect: {
            kind: "keyword",
            keyword: {
              keyword: "Rush",
              raw: "＜Rush＞",
            },
          },
          while: {
            kind: "zoneCount",
            seat: "opponent",
            zone: "hand",
            op: "lte",
            value: 5,
            raw: "your opponent has 5 or fewer cards in their hand",
          },
        },
        {
          kind: "Aura",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          effect: {
            kind: "keyword",
            keyword: {
              keyword: "SecurityAttack",
              amount: 1,
              raw: "＜Security Attack +1＞",
            },
          },
          while: {
            kind: "zoneCount",
            seat: "opponent",
            zone: "hand",
            op: "lte",
            value: 5,
            raw: "your opponent has 5 or fewer cards in their hand",
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX6-055", compiled);
