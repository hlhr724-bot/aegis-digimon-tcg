import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] 1 of your Digimon gets +2000 DP and ＜Security Attack +1＞ (This Digimon checks 1 additional security card) for the turn.",
          kind: "ModifyDP",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          amount: 2000,
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "[Main] 1 of your Digimon gets +2000 DP and ＜Security Attack +1＞ (This Digimon checks 1 additional security card) for the turn.",
          kind: "GainKeyword",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1, sameTarget: true },
          keyword: { keyword: "SecurityAttack", amount: 1 },
          duration: "forTheTurn",
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "AddToHandSelf" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-093", compiled);
export default compiled;
