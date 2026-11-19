import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "Barrier",
          raw: "＜Barrier＞",
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart: "[When Digivolving] 1 of your opponent's Digimon gets -6000 DP for the turn.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -6000,
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "Then, you may use 1 Option card with [Plug-In] in its name or 1 yellow Option card with a cost of 5 or less from your hand without paying the cost.",
          kind: "UseOptionWithoutCost",
          filter: {
            controller: "mine",
            kind: ["Option"],
            playCostLte: 99,
            or: [
              {
                nameOrTrait: [
                  {
                    tokens: ["Plug-In"],
                    match: "name",
                  },
                ],
              },
              {
                colors: ["Yellow"],
                playCostLte: 5,
              },
            ],
          },
          payCost: false,
          optional: true,
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOptionUsed",
          fireCondition: {
            kind: "triggerOptionCostAtLeast",
            value: 2,
            raw: "when you use an Option card with a cost of 2 or more",
          },
          actions: [
            {
              kind: "Restrict",
              target: {
                filter: {
                  isSelfRef: true,
                },
                count: 1,
                isSelf: true,
              },
              restriction: "beReturned",
              duration: "untilOpponentTurnEnd",
              byOpponentEffectsOnly: true,
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
      namesExact: ["Sakuyamon: Maid Mode"],
      cost: 1,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT17-038", compiled);
