import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const highCap: CompiledCard["effects"][number]["condition"] = {
  kind: "anyOf",
  conditions: [
    { kind: "youHave", filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Digimon"], multicolor: true } },
    {
      kind: "youHave",
      filter: {
        zone: "digivolutionCards",
        controllerDefault: "mine",
        multicolor: true,
        hostFilter: { kind: ["Digimon"] },
      },
    },
  ],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "If you have a Digimon in play with 2 or more colors, or with 2 or more colors in one of its digivolution cards, delete 1 of your opponent's Digimon with 7000 DP or less instead.",
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 7000 } }, count: 1 },
          condition: highCap,
        },
        {
          effectTextPart: "[Main] Delete 1 of your opponent's Digimon with 4000 DP or less.",
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 4000 } }, count: 1 },
          condition: { kind: "not", condition: highCap },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 7000 } }, count: 1 },
          condition: highCap,
        },
        {
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 4000 } }, count: 1 },
          condition: { kind: "not", condition: highCap },
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT8-096", compiled);
