import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Trash any 2 digivolution cards from your opponent's Digimon.",
          kind: "TrashDigivolution",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              digivolutionCards: "hasAny",
            },
            count: "all",
          },
          amount: 2,
          scope: "acrossDigimon",
        },
        {
          kind: "SelectBind",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
            bindAs: "chosen",
          },
          condition: {
            kind: "youHave",
            filter: {
              controller: "mine",
              kind: ["Tamer"],
              nameOrTrait: [
                {
                  tokens: ["Joe Kido"],
                  match: "name",
                },
              ],
            },
            raw: "if you have a Tamer with [Joe Kido] in its name",
          },
        },
        {
          effectTextPart:
            "Then, if you have a Tamer with [Joe Kido] in its name, choose 1 of your Digimon. If your opponent has no Digimon with as many or more digivolution cards as the chosen Digimon, unsuspend it.",
          kind: "Unsuspend",
          target: {
            fromSelectionRef: "chosen",
            filter: {},
            count: 1,
          },
          condition: {
            kind: "opponentHasNone",
            filter: {
              kind: ["Digimon"],
              relativeTo: {
                attr: "digivolutionCount",
                op: "gte",
                selectionRef: "chosen",
              },
            },
            raw: "your opponent has no Digimon with as many or more digivolution cards as the chosen Digimon",
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ActivateMain",
        },
        {
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT14-091", compiled);
export { compiled };
