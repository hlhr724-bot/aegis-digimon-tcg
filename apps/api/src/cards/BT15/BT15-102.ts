import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          sourceFilter: {
            isSelfRef: true,
          },
          actions: [
            {
              kind: "Replacement",
              event: "wouldBePlayed",
              mode: "reduceCost",
              amount: 4,
              raw: "reduce the play cost by 4 for each [Dark Masters] trait card placed by this cost",
              cost: {
                kind: "place",
                target: {
                  filter: {
                    controller: "mine",
                    nameOrTrait: [
                      {
                        tokens: ["Dark Masters"],
                        match: "trait",
                      },
                    ],
                    distinctNames: true,
                    zone: ["trash", "battleArea"],
                  },
                  count: 3,
                  upTo: true,
                  from: ["battleArea", "trash"],
                },
                host: "self",
                raw: "by placing up to 3 [Dark Masters] trait cards with different names from your battle area or trash under it",
                trackCount: "placedDarkMasters",
              },
              optional: true,
              abortOnDecline: true,
              amountPerPlaced: 4,
              scaling: {
                per: 1,
                countSource: "placedDarkMasters",
                unit: "cards",
              },
            },
          ],
        },
      ],
    },
    {
      trigger: "EndOfYourTurn",
      actions: [
        {
          kind: "ActivateEffect",
          effectTextPart:
            "By placing 1 level 6 or lower card from your trash as this Digimon's bottom digivolution card, activate 1 [On Play] effect on that card as an effect of this Digimon.",
          target: {
            filter: {
              controller: "mine",
              zone: "digivolutionCards",
            },
            count: 1,
            isSelf: true,
          },
          effectType: "OnPlay",
          count: 1,
          asEffectOf: "this Digimon",
          lastPlacedOnly: true,
          cost: {
            kind: "place",
            target: {
              filter: {
                zone: "trash",
                controller: "mine",
                levelComparison: {
                  op: "lte",
                  value: 6,
                },
              },
              count: 1,
              from: ["trash"],
            },
            raw: "By placing 1 level 6 or lower card from your trash as this Digimon's bottom digivolution card",
            destination: "digivolutionStack",
            position: "bottom",
            host: "self",
          },
          optional: true,
          abortOnDecline: true,
        },
        {
          kind: "TrashTopDeck",
          effectTextPart:
            "Then, trash the top 2 cards of your opponent's deck for each of this Digimon's level 6 digivolution cards.",
          controller: "opponent",
          amount: 2,
          optional: false,
          scaling: {
            per: 1,
            filter: {
              isSelfRef: true,
              zone: "digivolutionCards",
              levels: [6],
            },
            unit: "digivolutionCards",
          },
          raw: "trash the top 2 cards of your opponent's deck for each of this Digimon's level 6 digivolution cards",
        },
      ],
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT15-102", compiled);
export { compiled };
