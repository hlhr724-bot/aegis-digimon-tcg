import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
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
      trigger: "Main",
      actions: [
        {
          kind: "TrashDigivolution",
          target: {
            filter: {
              isSelfRef: true,
              digivolutionCards: "hasAny",
            },
            count: 1,
            isSelf: true,
          },
          amount: 2,
          choose: true,
          abortOnDecline: true,
          raw: "＜Digi-Burst 2＞",
        },
        {
          kind: "Suspend",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
        },
      ],
      keywords: [
        {
          keyword: "DigiBurst",
          amount: 2,
          raw: "＜Digi-Burst 2＞",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST4-13", compiled);
