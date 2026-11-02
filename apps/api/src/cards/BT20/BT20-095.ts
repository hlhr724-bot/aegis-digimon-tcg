import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 3 cards of your deck. Add 1 [Chronicle] trait card among them to the hand. Return the rest to the top or bottom of the deck.",
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [{ tokens: ["Chronicle"], match: "trait" }],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckTopOrBottom",
        },
        { effectTextPart: "Then, place this card in the battle area.", kind: "PlaceInBattleAreaSelf" },
      ],
    },
    {
      trigger: "AllTurns",
      keywords: [{ keyword: "Delay", raw: "＜Delay＞" }],
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["Chronicle"], match: "trait" }],
          },
          actions: [
            {
              kind: "Digivolve",
              target: {
                filter: { controller: "mine", kind: ["Digimon"] },
                fromSelectionRef: "fellowshipMoved",
                count: 1,
              },
              into: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Chronicle"], match: "trait" }],
              },
              payCost: false,
              from: ["hand", "trash"],
              optional: true,
              cost: {
                kind: "moveToBattleArea",
                optional: true,
                target: {
                  filter: {
                    zone: "breeding",
                    controller: "mine",
                    kind: ["Digimon"],
                    levelComparison: { op: "gte", value: 3 },
                  },
                  count: 1,
                  bindAs: "fellowshipMoved",
                },
                raw: "By moving your level 3 or higher Digimon from the breeding area to the battle area",
              },
              abortOnDecline: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart:
            "[Security] You may play 1 [Chronicle] trait card with a play cost of 5 or less from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon", "Tamer"],
              playCostLte: 5,
              nameOrTrait: [{ tokens: ["Chronicle"], match: "trait" }],
            },
            count: 1,
          },
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
        },
        {
          kind: "PlaceInBattleAreaSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT20-095", compiled);
