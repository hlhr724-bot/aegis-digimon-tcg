import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const deleteWithinOwnDp: Action = {
  kind: "Delete",
  effectTextPart: "Delete 1 of your opponent's Digimon with as much DP as this Digimon or less.",
  target: {
    filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", relativeToSource: true } },
    count: 1,
  },
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "SecurityAttack", amount: 1 }, { keyword: "Armor Purge" }, { keyword: "Engage" }],
    },
    { trigger: "OnPlay", actions: [deleteWithinOwnDp] },
    { trigger: "WhenDigivolving", actions: [deleteWithinOwnDp] },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Restrict",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          restriction: "digivolve",
          duration: "permanent",
        },
      ],
    },
    {
      trigger: "OpponentsTurn",
      actions: [
        {
          kind: "Aura",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" },
          effect: { kind: "restriction", restriction: "attackPlayers" },
          while: { kind: "selfIsSuspended", raw: "this Digimon is suspended" },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { namesExact: ["Stegomon"], traits: ["Bio"], cost: 5, isAlternate: true },
    { baseIsTamer: true, traits: ["Kurata's Army"], cost: 7, isAlternate: true },
  ],
};

registerIrCard("BT27-017", compiled);
