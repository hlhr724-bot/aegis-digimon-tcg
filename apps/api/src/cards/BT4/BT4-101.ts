import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            '[Main] All of your Digimon gain "[Your Turn] When attacking an opponent\'s Digimon with no digivolution cards, delete that Digimon" for the turn.',
          kind: "GrantAuraToOpponents",
          includeLaterEntrants: true,
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: "all",
          },
          effectText:
            "[Your Turn] When attacking an opponent's Digimon with no digivolution cards, delete that Digimon",
          duration: "forTheTurn",
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

registerIrCard("BT4-101", compiled);
