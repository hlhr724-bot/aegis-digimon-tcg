import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OpponentsTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOpponentAttacks",
          activationCondition: {
            kind: "allYoursMatchFilter",
            filter: {
              kind: ["Digimon", "Tamer"],
              nameOrTrait: [{ tokens: ["D-Reaper"], match: "trait" }],
            },
            raw: "all of your Digimon and Tamers in the battle area have the [D-Reaper] trait",
          },
          actions: [
            {
              kind: "ModifyDP",
              target: {
                sourceRef: "triggerSubject",
                filter: {
                  controller: "opponent",
                  kind: ["Digimon"],
                },
                count: 1,
              },
              amount: -1000,
              duration: "forTheTurn",
              scaling: {
                per: 1,
                filter: {
                  controller: "mine",
                  nameOrTrait: [{ tokens: ["Mother D-Reaper"], match: "nameExact" }],
                },
                unit: "digivolutionCardsOfFiltered",
              },
            },
          ],
          raw: "When an opponent's Digimon attacks, if all of your Digimon and Tamers have the [D-Reaper] trait, DP reduction scaled by Mother D-Reaper digivolution cards",
        },
      ],
      isSecurity: true,
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] If you have no face-up security cards, by trashing your top security card, place this card face up as your top security card.",
          kind: "SecurityManipulation",
          op: "addTop",
          controller: "mine",
          source: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          faceUp: true,
          condition: {
            kind: "youHaveNone",
            filter: {
              controller: "mine",
              zone: "security",
              faceUp: true,
            },
            raw: "you have no face-up security cards",
          },
          cost: {
            kind: "trash",
            target: {
              filter: {
                controller: "mine",
                zone: "security",
              },
              count: 1,
            },
            raw: "by trashing your top security card",
          },
          optional: true,
          abortOnDecline: true,
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
              playCostLte: 0,
              playCostLteScaling: {
                per: 1,
                filter: {
                  controller: "mine",
                  nameOrTrait: [{ tokens: ["Mother D-Reaper"], match: "nameExact" }],
                },
                unit: "digivolutionCardsOfFiltered",
              },
              nameOrTrait: [
                {
                  tokens: ["D-Reaper"],
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

registerIrCard("BT19-100", compiled);
