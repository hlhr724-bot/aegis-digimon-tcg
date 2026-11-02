import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Place 1 of your Digimon on top of your security stack face down. Trash all of the digivolution cards of that Digimon.",
          kind: "SecurityManipulation",
          op: "placeAsSecurity",
          controller: "mine",
          source: { filter: { controller: "mine", kind: ["Digimon"], allowTokens: true }, count: 1 },
          toTop: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "SecurityManipulation",
          op: "addTop",
          controller: "mine",
          from: ["deck"],
          amount: 1,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT4-105", compiled);
