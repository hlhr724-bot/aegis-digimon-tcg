import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          condition: {
            kind: "youHave",
            filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Tamer"] },
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Choose 1 Tamer. You may play 1 Digimon card with the same color as the chosen tamer with a play cost of 3 or less from your hand or trash without paying the cost.",
          kind: "SelectBind",
          target: { filter: { controller: "mine", kind: ["Tamer"] }, count: 1, bindAs: "chosenTamer" },
        },
        {
          effectTextPart:
            "[Main] Choose 1 Tamer. You may play 1 Digimon card with the same color as the chosen tamer with a play cost of 3 or less from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              playCostLte: 3,
              sameColorAsSelectionRef: "chosenTamer",
            },
            count: 1,
          },
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart: "[Security] You may play 1 tamer card from your hand without paying the cost.",
          kind: "PlayWithoutCost",
          target: { filter: { controller: "mine", kind: ["Tamer"] }, count: 1 },
          from: ["hand"],
          payCost: false,
          optional: true,
        },
        { kind: "AddToHandSelf" },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("P-156", compiled);
