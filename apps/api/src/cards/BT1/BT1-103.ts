import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Until the end of your opponent's next turn, 1 of your Digimon gains ＜Blocker＞. (When an opponent's Digimon attacks, you may suspend this Digimon to force the opponent to attack it instead.)",
          kind: "GainKeyword",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          keyword: { keyword: "Blocker" },
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart: "[Security] Trigger <Draw 1＞. (Draw 1 card from your deck.)",
          kind: "Draw",
          controller: "mine",
          amount: 1,
        },
        { kind: "AddToHandSelf" },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-103", compiled);
export default compiled;
