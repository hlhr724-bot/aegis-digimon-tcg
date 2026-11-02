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
              effectTextPart: "Add 1 Digimon card with [Veedramon] in its name",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Veedramon"],
                    match: "name",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 blue Tamer card among them to the hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Tamer"],
                colors: ["Blue"],
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
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 Digimon card with [Veedramon] in its name",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Veedramon"],
                    match: "name",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 blue Tamer card among them to the hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Tamer"],
                colors: ["Blue"],
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
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenUnsuspended",
          sourceFilter: {
            isSelfRef: true,
          },
          actions: [
            {
              kind: "GainMemory",
              amount: 1,
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
};

registerIrCard("P-138", compiled);
