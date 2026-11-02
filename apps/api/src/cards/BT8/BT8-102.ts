import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] You may suspend 1 of your Digimon to suspend 1 of your opponent's Digimon or Tamers.",
          payCostBeforeOptional: false,
          kind: "Suspend",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon", "Tamer"],
            },
            count: 1,
          },
          bindResultAs: "samadhiSuspended",
          cost: {
            kind: "suspend",
            target: {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
              },
              count: 1,
            },
            raw: "by suspending 1 of your Digimon",
          },
          optional: true,
        },
        {
          effectTextPart:
            "Your opponent's cards suspended with this effect can't unsuspend until the end of their next turn.",
          kind: "Restrict",
          target: {
            fromSelectionRef: "samadhiSuspended",
            filter: {},
            count: 1,
          },
          condition: {
            kind: "ifThisEffectActed",
          },
          restriction: "unsuspend",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Suspend",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon", "Tamer"],
            },
            count: 1,
          },
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT8-102", compiled);
