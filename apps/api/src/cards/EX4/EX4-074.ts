import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "ModifyDP",
          playerWide: true,
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: "all",
          },
          amount: -5000,
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "OnDeletion",
      actions: [
        {
          kind: "ModifyDP",
          playerWide: true,
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: "all",
          },
          amount: -5000,
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "EndOfAttack",
      actions: [
        {
          effectTextPart:
            "[End of Attack] Delete this Digimon and 1 of your opponent's Digimon, and ＜Recovery +1 (Deck)＞.",
          kind: "Delete",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          additionalSimultaneousTargets: [{ filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 }],
        },
        {
          effectTextPart:
            "[End of Attack] Delete this Digimon and 1 of your opponent's Digimon, and ＜Recovery +1 (Deck)＞.",
          kind: "SecurityManipulation",
          op: "placeFromDeck",
          controller: "mine",
          amount: 1,
          toTop: true,
        },
        {
          kind: "Hatch",
          condition: {
            kind: "youHave",
            filter: {
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Tamer"],
            },
            raw: "you have a Tamer in play",
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      namesExact: ["ShineGreymon"],
      cost: 4,
      isAlternate: true,
    },
  ],
};

registerIrCard("EX4-074", compiled);
