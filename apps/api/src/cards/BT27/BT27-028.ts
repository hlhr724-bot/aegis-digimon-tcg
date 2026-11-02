import type { Action, CardEffect, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const decodeRaw = "＜Decode (Lv.4 or lower w/[Aquatic]/[DATA SQUAD] trait)＞";

const suspendLock: Action = {
  kind: "Restrict",
  target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 1 },
  restriction: "suspend",
  duration: "untilOpponentTurnEnd",
  blocksCombatSuspend: true,
};

const decode = (isInherited: boolean): CardEffect[] => [
  { trigger: "Static", isInherited, actions: [], keywords: [{ keyword: "Decode", raw: decodeRaw }] },
  {
    trigger: "AllTurns",
    isInherited,
    actions: [
      {
        kind: "Replacement",
        event: "wouldLeavePlay",
        leaveCause: "otherThanBattle",
        sourceFilter: { isSelfRef: true },
        actions: [
          {
            kind: "PlayWithoutCost",
            target: {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
                hostFilter: { isSelfRef: true },
                levelComparison: { op: "lte", value: 4 },
                nameOrTrait: [{ tokens: ["Aquatic", "DATA SQUAD"], match: "trait" }],
              },
              count: 1,
            },
            from: ["digivolutionCards"],
            payCost: false,
            playedByDecode: true,
            optional: true,
          },
        ],
      },
    ],
  },
];

export const compiled: CompiledCard = {
  effects: [
    ...decode(false),
    { trigger: "OnPlay", actions: [suspendLock] },
    { trigger: "WhenDigivolving", actions: [suspendLock] },
    {
      trigger: "Rule",
      actions: [
        {
          kind: "GrantStatic",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          grant: "trait",
          tokens: ["Aquatic"],
          duration: "permanent",
        },
      ],
    },
    ...decode(true),
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 4, traits: ["DATA SQUAD"], cost: 3, isAlternate: true }],
};

registerIrCard("BT27-028", compiled);
