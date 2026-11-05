import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };

const royalKnight = [{ tokens: ["Royal Knight"], match: "trait" as const }];

const placeHandCardUnder = {
  kind: "place",
  target: { filter: { controller: "mine", zone: "hand" }, count: 1 },
  underFilter: self.filter,
  host: "self",
  destination: "digivolutionStack",
  position: "bottom",
  raw: "By placing 1 card from your hand under this Tamer",
} satisfies Action["cost"];

const suspendThisTamer = {
  kind: "suspend",
  target: self,
  raw: "By suspending this Tamer",
} satisfies Action["cost"];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: placeHandCardUnder,
          optional: true,
          abortOnDecline: true,
          actions: [
            { kind: "Draw", controller: "mine", amount: 1 },
            { kind: "GainMemory", amount: 1 },
          ],
        },
      ],
    },
    {
      trigger: "EndOfYourTurn",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: suspendThisTamer,
          optional: true,
          abortOnDecline: true,
          actions: [
            {
              kind: "Modal",
              choose: 1,
              labels: ["Digivolve into a [Royal Knight] card under this Tamer", "Use a [Royal Knight] Option"],
              options: [
                [
                  {
                    kind: "Digivolve",
                    effectTextPart:
                      "1 of your Digimon may digivolve into a [Royal Knight] trait card under this Tamer with the cost reduced by 2.",
                    target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
                    into: { controllerDefault: "mine", kind: ["Digimon"], nameOrTrait: royalKnight },
                    from: ["underThisTamer"],
                    reduceCost: 2,
                    payCost: true,
                    optional: true,
                  },
                ],
                [
                  {
                    kind: "UseOptionWithoutCost",
                    effectTextPart:
                      "You may use 1 use cost 5 or higher [Royal Knight] trait Option card from your hand or under this Tamer with the cost reduced by 3.",
                    filter: {
                      controllerDefault: "mine",
                      kind: ["Option"],
                      playCostGte: 5,
                      nameOrTrait: royalKnight,
                    },
                    from: ["hand", "underThisTamer"],
                    payCost: true,
                    reduceCostBy: 3,
                    optional: true,
                  },
                ],
              ],
            },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [{ kind: "PlayWithoutCost", target: self, payCost: false }],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-104", compiled);
