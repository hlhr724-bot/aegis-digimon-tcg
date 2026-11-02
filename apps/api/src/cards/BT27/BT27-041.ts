import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const deletionText =
  "[All Turns] [Once Per Turn] When any of your other Digimon with [Chessmon] in their names are deleted, 1 of your opponent's Digimon gets -5000 DP for the turn.";

const weakenOpponent: Action[] = [
  {
    kind: "GainKeyword",
    effectTextPart:
      "[On Play] [When Digivolving] Until your opponent's turn ends, give 1 of their Digimon ＜Security A. -1＞",
    target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
    keyword: { keyword: "SecurityAttack", amount: -1 },
    duration: "untilOpponentTurnEnd",
  },
  {
    kind: "ModifyDP",
    effectTextPart: "and for each of your Digimon with [Chessmon] in their names, -3000 DP.",
    target: { filter: {}, count: 1, sameTarget: true },
    amount: -3000,
    duration: "untilOpponentTurnEnd",
    scaling: {
      per: 1,
      unit: "cards",
      filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["Chessmon"], match: "name" }] },
    },
  },
];
export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Barrier" }, { keyword: "Ascension" }] },
    { trigger: "OnPlay", actions: weakenOpponent },
    { trigger: "WhenDigivolving", actions: weakenOpponent },
    {
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          effectTextPart: deletionText,
          event: "onDeletionOf",
          sourceFilter: {
            controller: "mine",
            excludeSelf: true,
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["Chessmon"], match: "name" }],
          },
          actions: [
            {
              kind: "ModifyDP",
              effectTextPart: deletionText,
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              amount: -5000,
              duration: "forTheTurn",
            },
          ],
        },
      ],
    },
  ],
  digivolutionRequirement: [
    { level: 4, names: ["Chessmon"], cost: 3, isAlternate: true },
    { level: 4, traits: ["DATA SQUAD"], cost: 3, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT27-041", compiled);
