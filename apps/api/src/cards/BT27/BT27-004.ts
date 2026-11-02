import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const digivolveText =
  "[Your Turn] [Once Per Turn] When any of your other Digimon with [Chessmon] in their names are played, this Digimon may digivolve into a Digimon card with [Chessmon] in its name in the hand with the cost reduced by 2.";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "YourTurn",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          effectTextPart: digivolveText,
          event: "whenPlayed",
          sourceFilter: {
            controller: "mine",
            excludeSelf: true,
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["Chessmon"], match: "name" }],
          },
          actions: [
            {
              kind: "Digivolve",
              effectTextPart: digivolveText,
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              into: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Chessmon"], match: "name" }],
              },
              from: ["hand"],
              payCost: true,
              reduceCost: 2,
              optional: true,
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT27-004", compiled);
