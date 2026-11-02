import type { Action, CardEffect, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const ownSecurityRemoved = {
  kind: "triggerRemovedSecuritySeat",
  seat: "mine",
} as const;

const self = { filter: { isSelfRef: true }, count: 1, isSelf: true } as const;

const placeWitchelnyTextCardAsBottomSecurity: Action = {
  effectTextPart:
    "[On Play] [When Digivolving] You may place 1 [Witchelny] text card from your hand as the bottom security card.",
  kind: "SecurityManipulation",
  op: "addBottom",
  controller: "mine",
  amount: 1,
  source: {
    filter: {
      controller: "mine",
      zone: "hand",
      nameOrTrait: [{ tokens: ["Witchelny"], match: "text" }],
    },
    count: 1,
  },
  optional: true,
  raw: "You may place 1 [Witchelny] text card from your hand as the bottom security card",
};

const attackByTrashingTopSecurity: Action = {
  costTextEmphasis: "Then, by trashing your top security card",
  optionalTextEmphasis: "1 of your Digimon may attack",
  effectTextPart: "Then, by trashing your top security card, 1 of your Digimon may attack.",
  kind: "Attack",
  target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
  cost: {
    kind: "trash",
    target: { filter: { controller: "mine", zone: "security", position: "top" }, count: 1 },
    raw: "by trashing your top security card",
  },
  optional: true,
  abortOnDecline: true,
  raw: "Then, by trashing your top security card, 1 of your Digimon may attack",
};

const entryWindow = (trigger: "OnPlay" | "WhenDigivolving"): CardEffect => ({
  trigger,
  actions: [placeWitchelnyTextCardAsBottomSecurity, attackByTrashingTopSecurity],
});

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Barrier", raw: "＜Barrier＞" }],
    },
    entryWindow("OnPlay"),
    entryWindow("WhenDigivolving"),
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          fireCondition: ownSecurityRemoved,
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              amount: -6000,
              duration: "forTheTurn",
              raw: "1 of your opponent's Digimon gets -6000 DP for the turn",
            },
            {
              kind: "Delete",
              target: {
                filter: {
                  controller: "opponent",
                  kind: ["Digimon"],
                  dp: { op: "lte", value: 6000 },
                },
                count: 1,
              },
              condition: {
                kind: "zoneCount",
                seat: "mine",
                zone: "security",
                op: "lte",
                value: 3,
                raw: "you have 3 or fewer security cards",
              },
              raw: "Then, if you have 3 or fewer security cards, delete 1 of their 6000 DP or lower Digimon",
            },
          ],
          raw: "When your security stack is removed from, 1 of your opponent's Digimon gets -6000 DP for the turn. Then, if you have 3 or fewer security cards, delete 1 of their 6000 DP or lower Digimon.",
        },
      ],
    },
    {
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          fireCondition: ownSecurityRemoved,
          actions: [
            {
              kind: "Unsuspend",
              target: self,
              optional: true,
              raw: "this Digimon may unsuspend",
            },
          ],
          raw: "When your security stack is removed from, this Digimon may unsuspend.",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 4, texts: ["Witchelny"], cost: 3, isAlternate: true }],
};

registerIrCard("EX13-033", compiled);
