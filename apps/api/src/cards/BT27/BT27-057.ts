import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const trashChessmonText = {
  kind: "trash",
  target: {
    filter: { controller: "mine", zone: "hand", nameOrTrait: [{ tokens: ["Chessmon"], match: "text" }] },
    count: 1,
  },
  raw: "By trashing 1 card with [Chessmon] in its text from your hand",
} satisfies Action["cost"];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "CostGatedBlock",
          effectTextPart:
            "[Start of Your Main Phase] By trashing 1 card with [Chessmon] in its text from your hand, ＜Draw 1＞ and gain 1 memory.",
          cost: trashChessmonText,
          optional: true,
          abortOnDecline: true,
          actions: [
            { kind: "Draw", controller: "mine", amount: 1 },
            { kind: "GainMemory", amount: 1 },
          ],
        },
      ],
    },
    {
      trigger: "OnDeletion",
      isInherited: true,
      actions: [
        {
          kind: "DeDigivolve",
          effectTextPart: "[On Deletion] ＜De-Digivolve 1＞ 1 of your opponent's Digimon.",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: 1,
        },
      ],
    },
  ],
  digivolutionRequirement: [
    { level: 2, texts: ["Chessmon"], cost: 0, isAlternate: true },
    { level: 2, traits: ["DATA SQUAD"], cost: 0, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT27-057", compiled);
