import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Unsuspend 1 of your Digimon and suspend 1 of your opponent's Digimon.",
          kind: "Unsuspend",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
        },
        {
          effectTextPart: "[Main] Unsuspend 1 of your Digimon and suspend 1 of your opponent's Digimon.",
          kind: "Suspend",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT4-108", compiled);
