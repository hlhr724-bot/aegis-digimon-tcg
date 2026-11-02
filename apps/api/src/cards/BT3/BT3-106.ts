import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] All of your Digimon with ＜Blocker＞ or ＜Reboot＞ gain ＜Security Attack +1＞ (This Digimon checks 1 additional security card) for the turn.",
          kind: "GainKeyword",
          playerWide: true,
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              or: [
                {
                  keywords: ["Blocker"],
                },
                {
                  keywords: ["Reboot"],
                },
              ],
            },
            count: "all",
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
    {
      trigger: "Security",
      actions: [
        {
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT3-106", compiled);
