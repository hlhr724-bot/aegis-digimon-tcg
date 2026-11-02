import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Choose a Digimon digivolution card placed under 1 of your Digimon and play it as another Digimon without paying its memory cost.",
          kind: "SelectBind",
          target: {
            filter: { controller: "mine", kind: ["Digimon"], digivolutionStackKind: ["Digimon"] },
            count: 1,
            bindAs: "chosenHost",
          },
        },
        {
          effectTextPart:
            "[Main] Choose a Digimon digivolution card placed under 1 of your Digimon and play it as another Digimon without paying its memory cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              zone: "digivolutionCards",
              controller: "mine",
              kind: ["Digimon"],
              hostFilter: { boundRef: "chosenHost" },
            },
            count: 1,
          },
          from: ["digivolutionCards"],
          payCost: false,
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("ST2-15", compiled);
