import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          condition: {
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["X Antibody"],
                  match: "trait",
                },
              ],
            },
            raw: "you have a Digimon with [X Antibody] in its traits in play",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Digivolve 1 of your Digimon into a Digimon card with [Dex] or [DeathX] in its name from your trash for its memory cost.",
          kind: "Digivolve",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
          },
          into: {
            kind: ["Digimon"],
            nameOrTrait: [
              {
                tokens: ["Dex"],
                match: "name",
              },
              {
                tokens: ["DeathX"],
                match: "name",
              },
            ],
          },
          from: ["trash"],
          payCost: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT9-106", compiled);
