import type { Action, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const deleteTextPart =
  "Then, delete 1 of your opponent’s Digimon with as much or less DP as 1 of your [Dark Dragon] or [Evil Dragon] trait Digimon.";

const deleteByDragonReference: Action[] = [
  {
    effectTextPart: deleteTextPart,
    kind: "SelectBind",
    target: {
      filter: {
        controller: "mine",
        kind: ["Digimon"],
        nameOrTrait: [{ tokens: ["Dark Dragon", "Evil Dragon"], match: "trait" }],
      },
      count: 1,
      bindAs: "dragonDpReference",
    },
  },
  {
    effectTextPart: deleteTextPart,
    kind: "Delete",
    target: {
      filter: {
        controller: "opponent",
        kind: ["Digimon"],
        relativeTo: { attr: "dp", op: "lte", selectionRef: "dragonDpReference" },
      },
      count: 1,
    },
  },
];

const compiled: CompiledCard = {
  digivolutionRequirement: [{ level: 4, traits: ["Dark Dragon", "Evil Dragon"], cost: 3, isAlternate: true }],
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          effectTextPart: "[On Play] [When Digivolving] Trash 2 cards in your hand.",
          kind: "Trash",
          target: {
            filter: {
              controller: "mine",
              zone: "hand",
            },
            count: 2,
          },
        },
        ...deleteByDragonReference,
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart: "[On Play] [When Digivolving] Trash 2 cards in your hand.",
          kind: "Trash",
          target: {
            filter: {
              controller: "mine",
              zone: "hand",
            },
            count: 2,
          },
        },
        ...deleteByDragonReference,
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Aura",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Dark Dragon", "Evil Dragon"],
                  match: "trait",
                },
              ],
            },
            count: "all",
          },
          effect: {
            kind: "keyword",
            keyword: {
              keyword: "Scapegoat",
              raw: "＜Scapegoat＞",
            },
          },
          while: {
            kind: "zoneCount",
            seat: "mine",
            zone: "hand",
            op: "lte",
            value: 4,
            raw: "you have 4 or fewer cards in your hand",
          },
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "Aura",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Dark Dragon", "Evil Dragon"],
                  match: "trait",
                },
              ],
            },
            count: "all",
          },
          effect: {
            kind: "keyword",
            keyword: {
              keyword: "SecurityAttack",
              amount: 1,
              raw: "＜Security Attack +1＞",
            },
          },
          while: {
            kind: "zoneCount",
            seat: "mine",
            zone: "hand",
            op: "lte",
            value: 4,
            raw: "you have 4 or fewer cards in your hand",
          },
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX11-050", compiled);
