import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "BeforePayCost",
      actions: [
        {
          kind: "ReducePlayCost",
          payment: {
            kind: "automatic",
            condition: {
              kind: "youHave",
              filter: {
                zone: "battleArea",
                controllerDefault: "mine",
                kind: ["Tamer"],
              },
              count: 1,
              raw: "you have a Tamer in play",
            },
          },
          amount: { kind: "fixed", value: 1 },
          scaling: {
            per: 1,
            filter: {
              zone: "battleArea",
              controller: "mine",
              kind: ["Tamer"],
            },
            unit: "cards",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] You may play 1 Digimon card with [Justimon] in its name from your hand without paying its memory cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Justimon"],
                  match: "name",
                },
              ],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          optional: true,
          bindResultAs: "playedDigimon",
        },
        {
          effectTextPart:
            "If you do, delete 1 of your opponent's Digimon with a play cost less than or equal to the Digimon you played.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              playCost: {
                lteBindResult: "playedDigimon",
              },
            },
            count: 1,
          },
          condition: {
            kind: "bindingExists",
            ref: "playedDigimon",
            raw: "you do",
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart: "[Security] You may play 1 black Tamer card from your hand without paying its memory cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Tamer"],
              colors: ["Black"],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          optional: true,
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

registerIrCard("BT10-106", compiled);
