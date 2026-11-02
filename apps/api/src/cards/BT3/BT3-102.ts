import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  cardId: "BT3-102",
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Your opponent may trash the top card of their security stack.",
          kind: "SecurityManipulation",
          op: "trashTop",
          controller: "opponent",
          optionalFor: "opponent",
          amount: 1,
        },
        {
          effectTextPart:
            "If they don't, trigger ＜Recovery +1 (Deck)＞. (Place the top card of your deck on top of your security stack.)",
          kind: "SecurityManipulation",
          op: "addTop",
          controller: "mine",
          source: "deck",
          condition: { kind: "opponentDeclinedTrash", raw: "if they don't" },
          amount: 1,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT3-102", compiled);
