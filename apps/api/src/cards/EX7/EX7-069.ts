import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] You may suspend 1 level 6 or lower Digimon.",
          kind: "Suspend",
          target: {
            filter: {
              controllerDefault: "any",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 6,
              },
            },
            count: 1,
          },
          optional: true,
        },
        {
          effectTextPart: "If this effect suspended your Digimon, unsuspend 1 of your Digimon.",
          kind: "Unsuspend",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
          },
          condition: {
            kind: "lastSuspendedIsMine",
            raw: "this effect suspended your Digimon",
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ActivateMain",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX7-069", compiled);
