import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "Draw",
          effectTextPart:
            "[Start of Your Main Phase] By trashing 1 card with the [Chronicle] trait from your hand, ＜Draw 1＞ and gain 1 memory.",
          controller: "mine",
          amount: 1,
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
                nameOrTrait: [{ tokens: ["Chronicle"], match: "trait" }],
              },
              count: 1,
            },
          },
          optional: true,
          abortOnDecline: true,
        },
        { kind: "GainMemory", amount: 1 },
      ],
    },
    { trigger: "Static", isInherited: true, actions: [], keywords: [{ keyword: "Raid", raw: "＜Raid＞" }] },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { namesExact: ["Kyokyomon"], cost: 0, isAlternate: true },
    { level: 2, colors: ["Black"], traits: ["X Antibody"], cost: 0, isAlternate: true },
  ],
};

registerIrCard("BT27-008", compiled);
