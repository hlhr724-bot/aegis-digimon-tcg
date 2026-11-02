import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart:
                "Add 1 Digimon card with [Greymon] in its name (other than [DoruGreymon], [BurningGreymon], or [DexDoruGreymon])",
              filter: {
                excludeNameOrTrait: [
                  { tokens: ["DoruGreymon"], match: "nameExact" },
                  { tokens: ["BurningGreymon"], match: "nameExact" },
                  { tokens: ["DexDoruGreymon"], match: "nameExact" },
                ],
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Greymon"],
                    match: "name",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 Digimon card with [Omnimon] in its name among them to your hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Omnimon"],
                    match: "name",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT5-007", compiled);
