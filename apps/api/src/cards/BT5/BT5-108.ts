import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Delete 1 of your opponent's unsuspended level 4 Digimon and 1 of your opponent's unsuspended level 5 Digimon.",
          kind: "Delete",
          target: { filter: { controller: "opponent", unsuspended: true, kind: ["Digimon"], levels: [4] }, count: 1 },
          additionalSimultaneousTargets: [
            { filter: { controller: "opponent", unsuspended: true, kind: ["Digimon"], levels: [5] }, count: 1 },
          ],
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT5-108", compiled);
