import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Unsuspend 1 of your Digimon with ＜Blocker＞.",
          kind: "Unsuspend",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              keywords: ["Blocker"],
            },
            count: 1,
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Unsuspend",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              keywords: ["Blocker"],
            },
            count: "all",
          },
        },
        {
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              keywords: ["Blocker"],
            },
            count: "all",
          },
          amount: 5000,
          duration: "forTheTurn",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT2-104", compiled);
