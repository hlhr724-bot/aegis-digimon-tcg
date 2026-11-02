import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] You may play 1 Tamer card or 1 Digimon card with [Hybrid] in its traits from one of your Digimon's digivolution cards as a Tamer or another Digimon without paying its memory cost.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              digivolutionCards: "hasAny",
            },
            count: 1,
            bindAs: "chosenHost",
          },
        },
        {
          effectTextPart:
            "[Main] You may play 1 Tamer card or 1 Digimon card with [Hybrid] in its traits from one of your Digimon's digivolution cards as a Tamer or another Digimon without paying its memory cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              zone: "digivolutionCards",
              kind: ["Tamer"],
              hostFilter: { boundRef: "chosenHost" },
            },
            orFilters: [
              {
                controller: "mine",
                zone: "digivolutionCards",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Hybrid"],
                    match: "traitContains",
                  },
                ],
                hostFilter: { boundRef: "chosenHost" },
              },
            ],
            count: 1,
          },
          from: ["digivolutionCards"],
          payCost: false,
          optional: true,
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
              nameOrTrait: [
                {
                  tokens: ["Koji Minamoto"],
                  match: "nameExact",
                },
              ],
            },
            count: 1,
          },
          from: ["hand", "trash"],
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

registerIrCard("BT7-096", compiled);
