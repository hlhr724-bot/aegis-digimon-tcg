import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Trigger ＜Draw 2＞ (Draw 2 cards from your deck).",
          kind: "Draw",
          controller: "mine",
          amount: 2,
        },
        {
          effectTextPart: "Then 1 of your Digimon gets +2000 DP for the turn.",
          kind: "ModifyDP",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          amount: 2000,
          duration: "forTheTurn",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-092", compiled);
export default compiled;
