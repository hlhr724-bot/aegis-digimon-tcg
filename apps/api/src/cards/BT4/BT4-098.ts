import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            '[Main] 1 of your Digimon with [Hybrid] in its form gets +3000 DP, ＜Security Attack +1＞ (This Digimon checks 1 additional security card), and "[Your Turn] When this Digimon is blocked, gain +3 memory" for the turn.',
          kind: "SelectBind",
          target: {
            filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["Hybrid"], match: "trait" }] },
            count: 1,
            bindAs: "atomicInfernoTarget",
          },
        },
        {
          effectTextPart:
            '[Main] 1 of your Digimon with [Hybrid] in its form gets +3000 DP, ＜Security Attack +1＞ (This Digimon checks 1 additional security card), and "[Your Turn] When this Digimon is blocked, gain +3 memory" for the turn.',
          kind: "ModifyDP",
          target: { filter: {}, count: 1, fromSelectionRef: "atomicInfernoTarget" },
          amount: 3000,
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            '[Main] 1 of your Digimon with [Hybrid] in its form gets +3000 DP, ＜Security Attack +1＞ (This Digimon checks 1 additional security card), and "[Your Turn] When this Digimon is blocked, gain +3 memory" for the turn.',
          kind: "GainKeyword",
          target: { filter: {}, count: 1, fromSelectionRef: "atomicInfernoTarget" },
          keyword: { keyword: "SecurityAttack", amount: 1, raw: "＜Security Attack +1＞" },
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            '[Main] 1 of your Digimon with [Hybrid] in its form gets +3000 DP, ＜Security Attack +1＞ (This Digimon checks 1 additional security card), and "[Your Turn] When this Digimon is blocked, gain +3 memory" for the turn.',
          kind: "SubTrigger",
          event: "whenBlocked",
          printedClause: "[Granted] [Your Turn] When this Digimon is blocked, gain +3 memory.",
          on: { filter: {}, count: 1, fromSelectionRef: "atomicInfernoTarget" },
          sourceFilter: { isSelfRef: true },
          actions: [{ kind: "GainMemory", amount: 3 }],
          condition: { kind: "isYourTurn" },
          duration: "untilYourTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "GainKeyword",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: "all" },
          keyword: { keyword: "SecurityAttack", amount: 1, raw: "＜Security Attack +1＞" },
          duration: "untilYourTurnEnd",
          playerScoped: true,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT4-098", compiled);
