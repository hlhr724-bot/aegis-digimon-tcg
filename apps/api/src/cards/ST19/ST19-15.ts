import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] 1 of your opponent's Digimon gets -6000 DP for the turn. If there are 3 or more Digimon, increase the DP reduction of this effect by -6000.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -6000,
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "[Main] 1 of your opponent's Digimon gets -6000 DP for the turn. If there are 3 or more Digimon, increase the DP reduction of this effect by -6000.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
            sameTarget: true,
          },
          amount: -6000,
          duration: "forTheTurn",
          condition: {
            kind: "totalDigimonCount",
            op: "gte",
            value: 3,
            raw: "if there are 3 or more total Digimon (both players combined) — KB Q863",
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

registerIrCard("ST19-15", compiled);
