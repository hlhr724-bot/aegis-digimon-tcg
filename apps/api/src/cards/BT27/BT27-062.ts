import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const knightmonText = [{ tokens: ["Knightmon"], match: "text" as const }];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Modal",
          choose: 1,
          labels: ["Play a [Knightmon]-text card", "Use a [Knightmon]-text Option"],
          options: [
            [
              {
                kind: "PlayWithoutCost",
                effectTextPart:
                  "You may play or use 1 card with [Knightmon] in its text from your hand with the cost reduced by 2.",
                target: {
                  filter: {
                    controllerDefault: "mine",
                    zone: "hand",
                    kind: ["Digimon", "Tamer"],
                    nameOrTrait: knightmonText,
                  },
                  count: 1,
                },
                from: ["hand"],
                payCost: true,
                reduceCostBy: 2,
                optional: true,
              },
            ],
            [
              {
                kind: "UseOptionWithoutCost",
                effectTextPart:
                  "You may play or use 1 card with [Knightmon] in its text from your hand with the cost reduced by 2.",
                filter: {
                  controllerDefault: "mine",
                  zone: "hand",
                  kind: ["Option"],
                  nameOrTrait: knightmonText,
                },
                from: ["hand"],
                payCost: true,
                reduceCostBy: 2,
                optional: true,
              },
            ],
          ],
        },
      ],
    },
    {
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          sourceFilter: { isSelfRef: true, zone: "battleArea" },
          actions: [
            {
              kind: "Prevent",
              mode: "leavePlay",
              cost: {
                kind: "deleteOwn",
                target: {
                  filter: {
                    controller: "mine",
                    kind: ["Digimon"],
                    excludeSelf: true,
                    nameOrTrait: knightmonText,
                  },
                  count: 1,
                },
                raw: "by deleting 1 of your other Digimon with [Knightmon] in its text",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-062", compiled);
