import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 card with [Mamemon] in its text",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [{ tokens: ["Mamemon"], match: "text" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 card with the [Mutant] trait among them to the hand.",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [{ tokens: ["Mutant"], match: "trait" }],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      trigger: "OnDeletion",
      isInherited: true,
      actions: [
        {
          kind: "DeDigivolve",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: 1,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX13-046", compiled);
