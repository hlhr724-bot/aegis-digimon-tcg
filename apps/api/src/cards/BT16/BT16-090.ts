import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourTurn",
      actions: [{ kind: "SetMemory", value: 3, condition: { kind: "memoryAtMost", value: 2 } }],
    },
    {
      trigger: "Main",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: {
            kind: "compound",
            costs: [
              {
                kind: "deleteOwn",
                target: {
                  filter: {
                    controller: "mine",
                    kind: ["Digimon"],
                    nameOrTrait: [{ tokens: ["Ukkomon"], match: "nameExact" }],
                  },
                  count: 1,
                },
              },
              { kind: "trashBreeding" },
            ],
          },
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Big Ukkomon"], match: "nameExact" }],
                },
                count: 1,
              },
              from: ["hand"],
              payCost: true,
              costOverride: 3,
              breeding: true,
              requiresEmpty: "breedingArea",
              optional: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          payCost: false,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT16-090", compiled);
