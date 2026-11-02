import type { CompiledCard, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const target: Target = {
  filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 3000 } },
  count: "all",
};
const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Return all of your opponent's Digimon with 3000 DP or less to their owners' hands. If you have a Digimon in play with [Garurumon] or [Omnimon] in its name, return all of your opponent's Digimon with 5000 DP or less to their owners' hands instead. Trash all of the digivolution cards of those Digimon.",
          kind: "Return",
          target,
          to: "hand",
          condition: {
            kind: "youHaveNone",
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Garurumon", "Omnimon"], match: "name" }],
            },
          },
        },
        {
          effectTextPart:
            "[Main] Return all of your opponent's Digimon with 3000 DP or less to their owners' hands. If you have a Digimon in play with [Garurumon] or [Omnimon] in its name, return all of your opponent's Digimon with 5000 DP or less to their owners' hands instead. Trash all of the digivolution cards of those Digimon.",
          kind: "Return",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 5000 } },
            count: "all",
          },
          to: "hand",
          condition: {
            kind: "youHave",
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Garurumon", "Omnimon"], match: "name" }],
            },
            count: 1,
          },
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT5-096", compiled);
