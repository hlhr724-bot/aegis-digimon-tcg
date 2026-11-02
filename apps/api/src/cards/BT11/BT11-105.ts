import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          sourceFilter: { controllerDefault: "mine" },
          actions: [
            {
              kind: "Replacement",
              event: "wouldBePlayed",
              mode: "reduceCost",
              amount: 1,
              raw: "reduce the cost by 1",
              condition: {
                kind: "youHave",
                filter: {
                  zone: "battleArea",
                  controllerDefault: "mine",
                  nameOrTrait: [{ tokens: ["Snatchmon"], match: "name" }],
                },
                raw: "you have a [Snatchmon] in play",
              },
            },
          ],
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By placing 1 [Vemmon] or [Destromon] from your trash under 1 of your Digimon as its bottom digivolution card, you may digivolve 1 of your Digimon into 1 [Destromon] or [Galacticmon] from your trash for its digivolution cost.",
          kind: "PlaceUnder",
          target: {
            filter: {
              zone: "trash",
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Vemmon", "Destromon"], match: "name" }],
            },
            count: 1,
          },
          from: ["trash"],
          underFilter: { controller: "mine", kind: ["Digimon"] },
          position: "bottom",
          bindHostAs: "fusionizeHost",
        },
        {
          effectTextPart:
            "[Main] By placing 1 [Vemmon] or [Destromon] from your trash under 1 of your Digimon as its bottom digivolution card, you may digivolve 1 of your Digimon into 1 [Destromon] or [Galacticmon] from your trash for its digivolution cost.",
          kind: "Digivolve",
          condition: { kind: "ifThisEffectActed", raw: "if you placed a card under a Digimon" },
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          into: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Destromon", "Galacticmon"], match: "name" }] },
          from: ["trash"],
          payCost: true,
          optional: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Vemmon"], match: "name" }] },
              count: 1,
              to: "play",
            },
          ],
          rest: "trash",
          optional: true,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT11-105", compiled);
