import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Delete 1 of your opponent's Digimon with 6000 DP or less. If your opponent has 3 or more Digimon in play, delete 1 of your opponent's Digimon with 13000 DP or less instead.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: {
                op: "lte",
                value: 6000,
              },
            },
            count: 1,
          },
          condition: {
            kind: "not",
            condition: {
              kind: "opponentHas",
              filter: { zone: "battleArea", controllerDefault: "opponent", kind: ["Digimon"] },
              count: 3,
            },
          },
        },
        {
          effectTextPart:
            "[Main] Delete 1 of your opponent's Digimon with 6000 DP or less. If your opponent has 3 or more Digimon in play, delete 1 of your opponent's Digimon with 13000 DP or less instead.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: {
                op: "lte",
                value: 13000,
              },
            },
            count: 1,
          },
          condition: {
            kind: "opponentHas",
            filter: {
              zone: "battleArea",
              controllerDefault: "opponent",
              kind: ["Digimon"],
            },
            count: 3,
            raw: "your opponent has 3 or more Digimon in play",
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ActivateMain",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT6-094", compiled);
