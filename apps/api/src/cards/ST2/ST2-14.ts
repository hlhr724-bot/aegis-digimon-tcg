import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Choose 1 of your opponent's Digimon with no digivolution cards. That Digimon can't attack or block until the end of your opponent's next turn.",
          kind: "Restrict",
          target: {
            filter: { controllerDefault: "opponent", kind: ["Digimon"], digivolutionCards: "hasNone" },
            count: 1,
          },
          restriction: "attackOrBlock",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Restrict",
          target: {
            filter: { controllerDefault: "opponent", kind: ["Digimon"], digivolutionCards: "hasNone" },
            count: 1,
          },
          restriction: "attackOrBlock",
          duration: "untilYourTurnEnd",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("ST2-14", compiled);
