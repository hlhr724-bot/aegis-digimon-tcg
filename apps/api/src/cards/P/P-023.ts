import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      condition: {
        kind: "youHave",
        filter: {
          zone: "battleArea",
          controllerDefault: "mine",
          kind: ["Tamer"],
          nameOrTrait: [{ tokens: ["T.K. Takaishi"], match: "nameExact" }],
        },
        raw: "you have [T.K. Takaishi] in play",
      },
      actions: [
        {
          effectTextPart:
            "[Main] If you have [T.K. Takaishi] in play, place 1 of your [Patamon] at the bottom of your security stack face down. Trash that Digimon's digivolution cards.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Patamon"], match: "nameExact" }],
            },
            count: 1,
            bindAs: "selectedPatamon",
          },
        },
        {
          effectTextPart:
            "[Main] If you have [T.K. Takaishi] in play, place 1 of your [Patamon] at the bottom of your security stack face down. Trash that Digimon's digivolution cards.",
          kind: "TrashDigivolution",
          target: {
            fromSelectionRef: "selectedPatamon",
            filter: {},
            count: 1,
          },
          amount: 99,
        },
        {
          effectTextPart:
            "[Main] If you have [T.K. Takaishi] in play, place 1 of your [Patamon] at the bottom of your security stack face down. Trash that Digimon's digivolution cards.",
          kind: "SecurityManipulation",
          op: "addBottom",
          controller: "mine",
          source: {
            fromSelectionRef: "selectedPatamon",
            filter: {},
            count: 1,
          },
          faceDown: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [{ kind: "AddToHandSelf" }],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("P-023", compiled);
