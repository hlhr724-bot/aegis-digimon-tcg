import type { CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const sourceLess: Filter = { controller: "opponent", kind: ["Digimon"], digivolutionCards: "none" };
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Until the end of your opponent's next turn, their Digimon with no digivolution cards can't attack.",
          kind: "Restrict",
          target: { filter: sourceLess, count: "all" },
          whileMatchesTargetFilter: true,
          restriction: "attack",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Restrict",
          target: { filter: sourceLess, count: "all" },
          whileMatchesTargetFilter: true,
          restriction: "attack",
          duration: "forTheTurn",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-100", compiled);
export default compiled;
