import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Until the end of your opponent's next turn, 1 of your opponent's Digimon can't attack or block.",
          kind: "Restrict",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          restriction: "attack",
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] Until the end of your opponent's next turn, 1 of your opponent's Digimon can't attack or block.",
          kind: "Restrict",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1, sameTarget: true },
          restriction: "block",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Restrict",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" },
          restriction: "unsuspend",
          duration: "untilOpponentNextUnsuspendPhase",
          whileMatchesTargetFilter: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-113", compiled);
export default compiled;
