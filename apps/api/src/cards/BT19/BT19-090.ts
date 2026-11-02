import type { Action, CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const xrosHeart: Filter = {
  controller: "mine",
  zone: "underTamers",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Xros Heart"], match: "trait" }],
  dp: { op: "lte", value: 4000 },
};
const playFromTamer: Action = {
  effectTextPart:
    "You may play 1 Digimon card with the [Xros Heart]\u00a0trait and 4000 DP or less from under your Tamer without paying the cost.",
  kind: "PlayWithoutCost",
  target: { filter: xrosHeart, count: 1 },
  from: ["underTamers"],
  payCost: false,
  optional: true,
};
const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Activate 1 of the following effects:",
          kind: "Modal",
          choose: 1,
          labels: ["Play a Xros Heart Digimon", "Unsuspend Shoutmon EX6 and ShootingStarmon, then attack"],
          options: [
            [playFromTamer],
            [
              {
                effectTextPart:
                  "By unsuspending 1 of your [Shoutmon EX6] and 1 of your [ShootingStarmon], attack a player with 1 of your Digimon.",
                kind: "Attack",
                target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
                attackTargetScope: "player",
                cost: {
                  kind: "unsuspendNamed",
                  targets: [
                    {
                      filter: {
                        controller: "mine",
                        kind: ["Digimon"],
                        nameOrTrait: [{ tokens: ["Shoutmon EX6"], match: "nameExact" }],
                        suspended: true,
                      },
                      count: 1,
                    },
                    {
                      filter: {
                        controller: "mine",
                        kind: ["Digimon"],
                        nameOrTrait: [{ tokens: ["ShootingStarmon"], match: "nameExact" }],
                        suspended: true,
                      },
                      count: 1,
                    },
                  ],
                  optional: true,
                  raw: "by unsuspending 1 [Shoutmon EX6] and 1 [ShootingStarmon]",
                },
              },
            ],
          ],
        },
      ],
    },
    { trigger: "Security", actions: [playFromTamer], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT19-090", compiled);
