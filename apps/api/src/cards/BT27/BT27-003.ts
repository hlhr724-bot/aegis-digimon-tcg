import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenAttacking",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Digivolve",
          effectTextPart:
            "[When Attacking] [Once Per Turn] This Digimon may digivolve into a Digimon card with [Leomon] in its name or the [ACCEL] trait in the hand.",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          into: {
            controllerDefault: "mine",
            kind: ["Digimon"],
            nameOrTrait: [
              { tokens: ["Leomon"], match: "name" },
              { tokens: ["ACCEL"], match: "trait" },
            ],
          },
          from: ["hand"],
          payCost: true,
          optional: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-003", compiled);
