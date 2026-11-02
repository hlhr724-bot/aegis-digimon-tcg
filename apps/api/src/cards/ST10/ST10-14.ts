import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Place 1 of your opponent's Digimon face down at the top or bottom of your opponent's security stack.",
          kind: "SelectBind",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"] },
            count: 1,
            bindAs: "chaosDegradationTarget",
          },
        },
        {
          effectTextPart:
            "[Main] Place 1 of your opponent's Digimon face down at the top or bottom of your opponent's security stack.",
          kind: "SecurityManipulation",
          op: "addTopOrBottom",
          controller: "opponent",
          source: {
            fromSelectionRef: "chaosDegradationTarget",
            filter: {},
            count: 1,
          },
          faceDown: true,
        },
        {
          effectTextPart: "If you do, trash the top card of your opponent's security stack.",
          kind: "SecurityManipulation",
          op: "trashTop",
          controller: "opponent",
          amount: 1,
          condition: { kind: "ifThisEffectActed" },
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      optional: true,
      actions: [
        {
          kind: "SelectBind",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"] },
            count: 1,
            bindAs: "chaosDegradationSecurityTarget",
          },
        },
        {
          kind: "SecurityManipulation",
          op: "addTopOrBottom",
          controller: "opponent",
          source: {
            fromSelectionRef: "chaosDegradationSecurityTarget",
            filter: {},
            count: 1,
          },
          faceDown: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST10-14", compiled);
