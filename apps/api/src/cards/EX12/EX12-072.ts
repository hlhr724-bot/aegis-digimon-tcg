import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          condition: {
            kind: "youHave",
            filter: {
              kind: ["Digimon", "Tamer"],
              zone: ["battleArea", "breeding"],
              controllerDefault: "mine",
              nameOrTrait: [{ tokens: ["ME"], match: "trait" }],
            },
            raw: "you have a card w/[ME] trait",
          },
        },
      ],
    },
    {
      trigger: "AllTurns",
      isSecurity: true,
      actions: [
        {
          kind: "Aura",
          target: {
            filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["ME"], match: "trait" }] },
            count: "all",
          },
          effect: { kind: "keyword", keyword: { keyword: "Guard", raw: "＜Guard＞" } },
          raw: "All of your [ME] trait Digimon gain ＜Guard＞",
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Add your bottom security card to the hand and place this card face up as the bottom security card.",
          kind: "SecurityManipulation",
          op: "toHand",
          controller: "mine",
          amount: 1,
          toTop: false,
        },
        {
          effectTextPart:
            "[Main] Add your bottom security card to the hand and place this card face up as the bottom security card.",
          kind: "SecurityManipulation",
          op: "placeAsSecurity",
          controller: "mine",
          toTop: false,
          faceUp: true,
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              levelComparison: { op: "lte", value: 5 },
              nameOrTrait: [{ tokens: ["ME"], match: "trait" }],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          optional: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX12-072", compiled);
