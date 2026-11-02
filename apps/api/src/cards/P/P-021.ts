import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      condition: {
        kind: "youHave",
        filter: {
          zone: "battleArea",
          controllerDefault: "mine",
          kind: ["Tamer"],
          nameOrTrait: [{ tokens: ["Mimi Tachikawa"], match: "nameExact" }],
        },
        raw: "you have [Mimi Tachikawa] in play",
      },
      actions: [
        {
          effectTextPart:
            "[Main] If you have [Mimi Tachikawa] in play, you may play a [Palmon] from your hand without paying its memory cost to return 1 of your [Mimi Tachikawa] cards to its owner's hand.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Palmon"], match: "nameExact" }],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          optional: true,
          bindResultAs: "playedPalmon",
        },
        {
          effectTextPart:
            "[Main] If you have [Mimi Tachikawa] in play, you may play a [Palmon] from your hand without paying its memory cost to return 1 of your [Mimi Tachikawa] cards to its owner's hand.",
          kind: "Return",
          target: {
            filter: {
              controller: "mine",
              kind: ["Tamer"],
              nameOrTrait: [{ tokens: ["Mimi Tachikawa"], match: "nameExact" }],
            },
            count: 1,
          },
          to: "hand",
          condition: { kind: "bindingExists", ref: "playedPalmon" },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [{ kind: "AddToHandSelf" }],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("P-021", compiled);
