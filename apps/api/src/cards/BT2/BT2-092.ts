import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Up to 2 of your Digimon gain ＜Security Attack +1＞ (This Digimon checks 1 additional security card) for the turn.",
          kind: "GainKeyword",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 2,
            upTo: true,
          },
          keyword: {
            keyword: "SecurityAttack",
            amount: 1,
            raw: "＜Security Attack +1＞",
          },
          duration: "forTheTurn",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT2-092", compiled);
