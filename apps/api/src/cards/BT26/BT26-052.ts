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
              effectTextPart: "Add 1 card with the [Glowing Dawn] trait",
              filter: { nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }] },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 black card with the [BEATBREAK] trait among them to the hand.",
              filter: { colors: ["Black"], nameOrTrait: [{ tokens: ["BEATBREAK"], match: "trait" }] },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    { trigger: "Static", isInherited: true, actions: [], keywords: [{ keyword: "Reboot", raw: "＜Reboot＞" }] },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 2, traits: ["Glowing Dawn"], cost: 0, isAlternate: true }],
};

registerIrCard("BT26-052", compiled);
