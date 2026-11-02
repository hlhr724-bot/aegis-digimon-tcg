import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] You may trash 1 level 5 Digimon card with [Cyborg] in its traits in your hand to gain 2 memory and ＜Draw 1＞. (Draw 1 card from your deck.)",
          payCostBeforeOptional: false,
          kind: "GainMemory",
          amount: 2,
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
                kind: ["Digimon"],
                levels: [5],
                nameOrTrait: [
                  {
                    tokens: ["Cyborg"],
                    match: "trait",
                  },
                ],
              },
              count: 1,
            },
            raw: "by trashing 1 level 5 Digimon card with [Cyborg] in its traits in your hand",
          },
          optional: true,
          abortOnDecline: true,
        },
        {
          effectTextPart:
            "[Main] You may trash 1 level 5 Digimon card with [Cyborg] in its traits in your hand to gain 2 memory and ＜Draw 1＞. (Draw 1 card from your deck.)",
          kind: "Draw",
          controller: "mine",
          amount: 1,
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

registerIrCard("EX1-069", compiled);
