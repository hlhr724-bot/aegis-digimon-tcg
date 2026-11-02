import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] 1 of your Digimon gains “[On Deletion] Play this card without paying its memory cost. Any [On Play] effects on Digimon played with this effect don't activate” for the turn.",
          kind: "GrantStatic",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          grant: "effects",
          tokens: ["OnDeletionPlaySelfNoOnPlay"],
          duration: "forTheTurn",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT3-109", compiled);
export default compiled;
