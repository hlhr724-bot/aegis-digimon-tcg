import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Return 1 of your opponent's level 4 or lower Digimon to the hand. If you have a Digimon with [Gabumon]/[Garurumon] in its name, return 1 of your opponent's Digimon with the lowest level to the hand instead.",
          kind: "ConditionalBranch",
          condition: {
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Gabumon", "Garurumon"],
                  match: "name",
                },
              ],
            },
            raw: "you have a Digimon with [Gabumon]/[Garurumon] in its name",
          },
          ifTrue: [
            {
              kind: "Return",
              target: { filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestLevel" }, count: 1 },
              to: "hand",
            },
          ],
          ifFalse: [
            {
              kind: "Return",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 4 } },
                count: 1,
              },
              to: "hand",
            },
          ],
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

registerIrCard("BT15-090", compiled);
export { compiled };
