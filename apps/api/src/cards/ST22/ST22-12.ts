import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "Raid",
          raw: "＜Raid＞",
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Link",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Social", "Navi", "Tool"],
                  match: "trait",
                },
              ],
            },
            count: 1,
          },
          costDelta: -2,
          optional: true,
        },
      ],
      frequency: "OncePerTurn",
    },
    {
      trigger: "WhenLinking",
      isLinked: true,
      actions: [
        {
          kind: "Return",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: { op: "lte", value: 5000 },
            },
            count: 1,
          },
          to: "deckBottom",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  appFusionRequirement: [
    {
      names: ["Gatchmon", "Navimon", "Tweetmon"],
      cost: 0,
    },
  ],
};

registerIrCard("ST22-12", compiled);
