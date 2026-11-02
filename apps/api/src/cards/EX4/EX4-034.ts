import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 4,
          add: [
            {
              effectTextPart: "Add 1 2-color green card",
              filter: {
                controllerDefault: "mine",
                multicolor: true,
                colorCount: 2,
                colors: ["Green"],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 Tamer card with [Shu-Chong Wong] in its name among them to your hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Tamer"],
                nameOrTrait: [
                  {
                    tokens: ["Shu-Chong Wong"],
                    match: "name",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
          ...{ mandatory: true },
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenEffectSuspends",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
          },
          bySourceController: "mine",
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
                multicolor: true,
                colorCount: 2,
                colors: ["Green"],
              },
              from: ["hand"],
              payCost: true,
              costDelta: -2,
              optional: true,
            },
          ],
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX4-034", compiled);
