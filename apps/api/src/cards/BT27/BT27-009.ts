import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };

const boost = (trigger: "OnPlay" | "WhenDigivolving"): CardEffect => ({
  trigger,
  actions: [
    {
      kind: "ModifyDP",
      effectTextPart: "[On Play] [When Digivolving] 1 of your Digimon gets +3000 DP until your opponent's turn ends.",
      target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
      amount: 3000,
      duration: "untilOpponentTurnEnd",
    },
  ],
});

export const compiled: CompiledCard = {
  effects: [
    boost("OnPlay"),
    boost("WhenDigivolving"),
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Digivolve",
          effectTextPart:
            "[When Attacking] This Digimon may digivolve into a Digimon card with the [Chronicle] trait in the hand or trash.",
          target: self,
          into: {
            controllerDefault: "mine",
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["Chronicle"], match: "trait" }],
          },
          from: ["hand", "trash"],
          payCost: true,
          optional: true,
        },
      ],
    },
    {
      trigger: "YourTurn",
      isInherited: true,
      actions: [{ kind: "ModifyDP", target: self, amount: 2000, duration: "permanent" }],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { namesExact: ["Ryudamon"], cost: 2, isAlternate: true },
    { level: 3, traits: ["Chronicle"], cost: 2, isAlternate: true },
  ],
};

registerIrCard("BT27-009", compiled);
