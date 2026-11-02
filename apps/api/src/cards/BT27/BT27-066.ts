import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const deDigivolveText =
  "[On Play] [On Deletion] To 1 of your opponent's Digimon, ＜De-Digivolve 1＞ for each of your other Digimon with [Chessmon] in their names.";
const deleteText = "Then, delete 1 of your opponent's Digimon with a play cost of 5 or less.";

const deDigivolveThenDelete: Action[] = [
  {
    kind: "SelectBind",
    effectTextPart: deDigivolveText,
    target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1, bindAs: "rookChessmonTarget" },
  },
  {
    kind: "DeDigivolve",
    effectTextPart: deDigivolveText,
    target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1, fromSelectionRef: "rookChessmonTarget" },
    amount: 1,
    scaling: {
      per: 1,
      unit: "cards",
      filter: {
        controller: "mine",
        kind: ["Digimon"],
        excludeSelf: true,
        nameOrTrait: [{ tokens: ["Chessmon"], match: "name" }],
      },
    },
  },
  {
    kind: "Delete",
    effectTextPart: deleteText,
    target: { filter: { controller: "opponent", kind: ["Digimon"], playCostLte: 5 }, count: 1 },
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Reboot" }, { keyword: "Blocker" }] },
    { trigger: "OnPlay", actions: deDigivolveThenDelete },
    { trigger: "OnDeletion", actions: deDigivolveThenDelete },
    {
      trigger: "OpponentsTurn",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOpponentAttacks",
          actions: [
            {
              kind: "RedirectAttack",
              effectTextPart:
                "[Opponent's Turn] [Once Per Turn] When one of your opponent's Digimon attacks, you may change the attack target to this Digimon.",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              optional: true,
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
registerIrCard("BT27-066", compiled);
