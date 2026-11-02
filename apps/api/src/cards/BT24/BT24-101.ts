import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "CostModifier",
          costType: "digivolve",
          mode: "set",
          amount: 0,
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["Aegiochusmon"], match: "name" }],
          },
          duration: "permanent",
          scaling: { per: 1, filter: { controller: "mine" }, unit: "security" },
          residentZones: ["hand", "trash"],
        },
      ],
    },
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "SecurityManipulation",
          op: "trashTop",
          controller: "mine",
          amount: 1,
        },
        {
          effectTextPart:
            "[On Play] [When Digivolving] Trash your top security card and 1 of your opponent's Digimon gets -13000 DP until their turn ends.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -13000,
          duration: "untilOpponentTurnEnd",
        },
        {
          kind: "SecurityManipulation",
          op: "addTop",
          controller: "mine",
          source: "deck",
          amount: 2,
          condition: {
            kind: "zoneCount",
            seat: "mine",
            zone: "security",
            op: "lte",
            value: 1,
            raw: "you have 1 or fewer security cards",
          },
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "SecurityManipulation",
          op: "trashTop",
          controller: "mine",
          amount: 1,
        },
        {
          effectTextPart:
            "[On Play] [When Digivolving] Trash your top security card and 1 of your opponent's Digimon gets -13000 DP until their turn ends.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -13000,
          duration: "untilOpponentTurnEnd",
        },
        {
          kind: "SecurityManipulation",
          op: "addTop",
          controller: "mine",
          source: "deck",
          amount: 2,
          condition: {
            kind: "zoneCount",
            seat: "mine",
            zone: "security",
            op: "lte",
            value: 1,
            raw: "you have 1 or fewer security cards",
          },
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          fireCondition: { kind: "triggerRemovedSecuritySeat", seat: "mine" },
          actions: [
            {
              kind: "trashSecurityTop",
              controller: "opponent",
              count: 1,
            },
          ],
        },
      ],
      frequency: "OncePerTurn",
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          raw: "[All Turns] [Once Per Turn] When any of your [TS] trait Digimon or Tamers would leave the battle area, by trashing your top security card, they don't leave.",
          event: "wouldLeavePlay",
          affectsAll: true,
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon", "Tamer"],
            nameOrTrait: [
              {
                tokens: ["TS"],
                match: "trait",
              },
            ],
          },
          actions: [
            {
              kind: "Prevent",
              mode: "leavePlay",
              cost: {
                kind: "trash",
                target: {
                  filter: {
                    controller: "mine",
                    zone: "security",
                    position: "top",
                  },
                  count: 1,
                },
                raw: "by trashing your top security card",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 5,
      traits: ["TS"],
      cost: 5,
      isAlternate: true,
    },
    {
      level: 5,
      names: ["Aegiochusmon"],
      cost: 1,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT24-101", compiled);
