import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const trashBottomTwoThenPlaceSource: Action[] = [
  {
    kind: "TrashDigivolution",
    effectTextPart: "Trash the bottom 2 digivolution cards of 1 of your opponent's Digimon.",
    target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
    amount: 2,
    fromTop: false,
  },
  {
    kind: "PlaceUnder",
    effectTextPart:
      "Then, you may place 1 level 4 or lower [Ice-Snow] trait Digimon card from your hand as any of your Digimon's bottom digivolution card.",
    target: {
      filter: {
        zone: "hand",
        controller: "mine",
        kind: ["Digimon"],
        levelComparison: { op: "lte", value: 4 },
        nameOrTrait: [{ tokens: ["Ice-Snow"], match: "trait" }],
      },
      count: 1,
      from: ["hand"],
    },
    underFilter: { controller: "mine", kind: ["Digimon"] },
    position: "bottom",
    optional: true,
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "IceClad", raw: "＜Iceclad＞" }] },
    { trigger: "OnPlay", actions: trashBottomTwoThenPlaceSource },
    { trigger: "WhenDigivolving", actions: trashBottomTwoThenPlaceSource },
    {
      trigger: "Rule",
      actions: [
        {
          kind: "GrantStatic",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          grant: "trait",
          tokens: ["Ice-Snow"],
        },
      ],
    },
    {
      trigger: "EndOfAttack",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [{ kind: "GainMemory", amount: 1 }],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-027", compiled);
