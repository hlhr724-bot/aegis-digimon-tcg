import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
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
              controllerDefault: "mine",
              zone: ["battleArea", "breeding"],
              nameOrTrait: [{ tokens: ["VB"], match: "trait" }],
            },
            raw: "you have a card w/[VB] trait",
          },
        },
      ],
    },
    {
      trigger: "YourTurn",
      isSecurity: true,
      actions: [
        {
          kind: "SubTrigger",
          event: "whenAttacking",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
            levelComparison: {
              op: "gte",
              value: 4,
            },
            nameOrTrait: [
              {
                tokens: ["VB"],
                match: "trait",
              },
            ],
          },
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [
                    {
                      tokens: ["VB"],
                      match: "trait",
                    },
                  ],
                  sameLevelAsAttacker: true,
                },
                count: 1,
              },
              from: ["hand"],
              payCost: true,
              reduceCostBy: 3,
              optional: true,
            },
          ],
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
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              levelComparison: { op: "lte", value: 5 },
              nameOrTrait: [
                {
                  tokens: ["VB"],
                  match: "trait",
                },
              ],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          optional: true,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

export { compiled };
registerIrCard("EX12-069", compiled);
