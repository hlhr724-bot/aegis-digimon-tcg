import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 yellow Digimon card with the [Vaccine] trait",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                colors: ["Yellow"],
                nameOrTrait: [
                  {
                    tokens: ["Vaccine"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 yellow Tamer card among them to the hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Tamer"],
                colors: ["Yellow"],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -2000,
          duration: "forTheTurn",
          condition: { kind: "totalSecurityCount", op: "lte", value: 6 },
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT13-034", compiled);
