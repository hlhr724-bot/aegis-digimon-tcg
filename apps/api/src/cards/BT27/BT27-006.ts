import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

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
              effectTextPart: "Add 1 card with the [ALYSION] trait",
              filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["ALYSION"], match: "trait" }] },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 red Tamer card among them to the hand.",
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
      trigger: "YourTurn",
      isInherited: true,
      actions: [
        {
          kind: "ModifyDP",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          amount: 2000,
          duration: "permanent",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 2, texts: ["Gemmon"], cost: 0, isAlternate: true }],
};

registerIrCard("BT27-006", compiled);
