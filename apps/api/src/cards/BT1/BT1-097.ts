import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Trigger ＜Draw 1＞ (Draw 1 card from your deck).",
          kind: "Draw",
          controller: "mine",
          amount: 1,
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "Draw", controller: "mine", amount: 2 }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-097", compiled);
export default compiled;
