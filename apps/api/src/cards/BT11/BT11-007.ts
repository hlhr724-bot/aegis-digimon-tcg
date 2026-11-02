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
              effectTextPart: "Add 1 red Digimon card with [Vaccine] in its traits",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                colors: ["Red"],
                nameOrTrait: [{ tokens: ["Vaccine"], match: "trait" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 red Tamer card among them to your hand.",
              filter: { controllerDefault: "mine", kind: ["Tamer"], colors: ["Red"] },
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
      actions: [
        {
          kind: "GainMemory",
          amount: 1,
          condition: {
            kind: "youHave",
            filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Tamer"], colors: ["Red"] },
            raw: "you have a red Tamer in play",
          },
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT11-007", compiled);
