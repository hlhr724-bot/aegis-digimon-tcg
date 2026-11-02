import type { Action, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "#api/engine/effects/interpreter";

const placeLowestAsSecurity: Action = {
  effectTextPart: "Place 1 of your opponent's Digimon with the lowest DP as their top security card.",
  kind: "SecurityManipulation",
  op: "placeAsSecurity",
  controller: "opponent",
  toTop: true,
  source: {
    filter: { controller: "opponent", kind: ["Digimon"], zone: "battleArea", superlative: "lowestDP" },
    count: 1,
  },
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnDiscardSecurity",
      description: "When effects trash this card from the security stack, activate its [Security] effects.",
      actions: [placeLowestAsSecurity],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] 1 of your opponent's Digimon gets -6000 DP for the turn.",
          kind: "ModifyDP",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: -6000,
          duration: "forTheTurn",
        },
        {
          effectTextPart: "Then, add your top security card to the hand",
          kind: "SecurityManipulation",
          op: "toHand",
          controller: "mine",
          amount: 1,
          toTop: true,
        },
        {
          effectTextPart: "and place this card as the top security card.",
          kind: "SecurityManipulation",
          op: "placeAsSecurity",
          controller: "mine",
          toTop: true,
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [placeLowestAsSecurity],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-099", compiled);
