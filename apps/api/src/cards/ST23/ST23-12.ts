import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: {
            kind: "trashBottomFaceDownUnderTamer",
            controller: "mine",
            target: {
              filter: {
                controller: "mine",
                kind: ["Tamer"],
              },
              count: 1,
            },
            raw: "By trashing the bottom face-down card from under any of your Tamers",
          },
          optional: true,
          abortOnDecline: true,
          actions: [
            {
              kind: "Return",
              optional: true,
              target: {
                filter: {
                  zone: "trash",
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [
                    {
                      tokens: ["Glowing Dawn"],
                      match: "trait",
                    },
                  ],
                },
                count: 1,
              },
              to: "hand",
            },
          ],
        },
      ],
    },
    {
      trigger: "Static",
      actions: [],
      isInherited: true,
      keywords: [
        {
          keyword: "Retaliation",
          raw: "＜Retaliation＞",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 2,
      traits: ["Glowing Dawn"],
      cost: 0,
      isAlternate: true,
    },
  ],
};

registerIrCard("ST23-12", compiled);
