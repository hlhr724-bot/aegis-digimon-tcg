import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Your opponent can't use Option cards until the end of their next turn.",
          kind: "RestrictPlay",
          seat: "opponent",
          filter: { kind: ["Option"] },
          mode: "play",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart: "[Security] Your opponent can't use Option cards this turn.",
          kind: "RestrictPlay",
          seat: "opponent",
          filter: { kind: ["Option"] },
          mode: "play",
          duration: "forTheTurn",
        },
        {
          effectTextPart: "Then, add this card to its owner's hand.",
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX1-072", compiled);
