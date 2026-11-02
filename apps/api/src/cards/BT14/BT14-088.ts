import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 5,
          add: [
            {
              effectTextPart: "Add 1 level 3 Digimon card",
              filter: { controllerDefault: "mine", kind: ["Digimon"], levels: [3] },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 non-white Tamer card among them to the hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Tamer"],
                excludeColors: ["White"],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
          optional: true,
        },
      ],
    },
    {
      trigger: "OpponentsTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOpponentAttacks",
          triggerFilter: {
            controller: "opponent",
            kind: ["Digimon"],
            levelComparison: { op: "gte", value: 5 },
          },
          actions: [
            {
              kind: "MovePermanent",
              direction: "toBattle",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  location: "breedingArea",
                  dp: { op: "gte", value: 1 },
                },
                count: 1,
              },
              cost: { kind: "suspend", target: { filter: { isSelfRef: true }, count: 1 } },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [
        { kind: "PlayWithoutCost", target: { filter: { isSelfRef: true }, count: 1, isSelf: true }, payCost: false },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT14-088", compiled);
