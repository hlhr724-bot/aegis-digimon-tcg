import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Blocker", raw: "＜Blocker＞" }],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenEffectSuspends",
          sourceFilter: {
            controller: "any",
            excludeSelf: true,
            kind: ["Digimon", "Tamer"],
          },
          actions: [
            {
              kind: "Digivolve",
              target: {
                filter: {
                  isSelfRef: true,
                },
                count: 1,
                isSelf: true,
              },
              into: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Beast Dragon", "DigiPolice"],
                    match: "trait",
                  },
                ],
              },
              payCost: false,
              from: ["hand"],
              optional: true,
              condition: {
                kind: "selfDigivolutionStackHasTrait",
                filter: {
                  kind: ["Tamer"],
                  nameOrTrait: [
                    {
                      tokens: ["DigiPolice"],
                      match: "trait",
                    },
                  ],
                },
                raw: "a Tamer card with the [DigiPolice] trait is in this Digimon's digivolution cards",
              },
            },
          ],
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenEffectSuspends",
          sourceFilter: {
            controller: "any",
            excludeSelf: true,
            kind: ["Digimon", "Tamer"],
          },
          actions: [
            {
              kind: "Unsuspend",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [
                    {
                      tokens: ["Beast Dragon", "DigiPolice"],
                      match: "trait",
                    },
                  ],
                },
                count: 1,
              },
            },
          ],
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 4, traits: ["X Antibody", "DigiPolice"], cost: 3, isAlternate: true }],
};

registerIrCard("BT15-063", compiled);
export { compiled };
