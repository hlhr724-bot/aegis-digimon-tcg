import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOneOfYoursDigivolves",
          sourceFilter: {
            controllerDefault: "mine",
            nameOrTrait: [
              {
                tokens: ["Belphemon (X Antibody)"],
                match: "nameExact",
              },
            ],
          },
          actions: [
            {
              kind: "ActivateMain",
              cost: {
                kind: "return",
                target: {
                  filter: {
                    isSelfRef: true,
                  },
                  count: 1,
                  isSelf: true,
                },
                raw: "by returning this card to the bottom of the deck",
                to: "deckBottom",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
      isFromTrash: true,
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Delete 1 of your opponent's Digimon with a level as high or higher as the number of cards in your hand.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "gte",
                value: 0,
                scaling: {
                  per: 1,
                  filter: {
                    controllerDefault: "mine",
                    zone: "hand",
                  },
                  unit: "cards",
                },
              },
            },
            count: 1,
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
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT23-097", compiled);
