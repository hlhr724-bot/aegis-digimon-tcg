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
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Tamer"],
            },
            raw: "you have a Tamer in play",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 5 cards of your deck. You may digivolve 1 of your Digimon into 1 non-white Digimon card among them without paying its memory cost. If you don't, add 1 Digimon card among them to your hand. Place the remaining cards at the bottom of your deck in any order.",
          kind: "RevealAdd",
          revealCount: 5,
          digivolveOption: {
            into: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              excludeColors: ["White"],
            },
            payCost: false,
            optional: true,
          },
          add: [
            {
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
              },
              count: 1,
              to: "hand",
              ifDigivolveDeclined: true,
            },
          ],
          rest: "deckBottomAnyOrder",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Tamer"],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          optional: true,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX2-072", compiled);
