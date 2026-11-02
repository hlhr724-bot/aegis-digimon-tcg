import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By trashing 1 Digimon card with the [Machine]/[Cyborg]/[SoC] trait in your hand, delete 1 of your opponent's Digimon or Tamers with the lowest play cost.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon", "Tamer"],
              superlative: "lowestPlayCost",
            },
            count: 1,
          },
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Machine", "Cyborg", "SoC"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
            },
            raw: "By trashing 1 Digimon card with the [Machine]/[Cyborg]/[SoC] trait in your hand",
          },
          optional: true,
          abortOnDecline: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ActivateMain",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT15-097", compiled);
export { compiled };
