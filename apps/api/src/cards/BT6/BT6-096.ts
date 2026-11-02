import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] 1 of your Digimon gets +2000 DP and \"[When Attacking] Return 1 of your opponent's level 3 Digimon to its owner's hand. Trash all of the digivolution cards of that Digimon\" for the turn.",
          kind: "SelectBind",
          target: {
            filter: { controller: "mine", kind: ["Digimon"] },
            count: 1,
            bindAs: "boostedDigimon",
          },
        },
        {
          effectTextPart:
            "[Main] 1 of your Digimon gets +2000 DP and \"[When Attacking] Return 1 of your opponent's level 3 Digimon to its owner's hand. Trash all of the digivolution cards of that Digimon\" for the turn.",
          kind: "ModifyDP",
          target: {
            filter: {},
            count: 1,
            fromSelectionRef: "boostedDigimon",
          },
          amount: 2000,
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "[Main] 1 of your Digimon gets +2000 DP and \"[When Attacking] Return 1 of your opponent's level 3 Digimon to its owner's hand. Trash all of the digivolution cards of that Digimon\" for the turn.",
          kind: "GainTriggeredEffect",
          target: {
            filter: {},
            count: 1,
            fromSelectionRef: "boostedDigimon",
          },
          gainedTrigger: "whenAttacking",
          gainedActions: [
            {
              kind: "SelectBind",
              target: {
                filter: {
                  controller: "opponent",
                  kind: ["Digimon"],
                  levelComparison: { op: "eq", value: 3 },
                },
                count: 1,
                bindAs: "forbiddenTridentTarget",
              },
            },
            {
              kind: "Return",
              target: { filter: {}, count: 1, fromSelectionRef: "forbiddenTridentTarget" },
              to: "hand",
            },
          ],
          duration: "forTheTurn",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT6-096", compiled);
