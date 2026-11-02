import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          condition: {
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              colors: ["Green"],
            },
            raw: "you have a green Digimon",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] 1 of your Digimon with [Gargomon] or [Rapidmon] in its name may digivolve into a card with [Rapidmon] in its name in your hand, ignoring its digivolution requirements and without paying the cost.",
          kind: "Digivolve",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Gargomon", "Rapidmon"],
                  match: "name",
                },
              ],
            },
            count: 1,
          },
          into: {
            controllerDefault: "mine",
            nameOrTrait: [
              {
                tokens: ["Rapidmon"],
                match: "name",
              },
            ],
          },
          payCost: false,
          from: ["hand"],
          ignoreRequirements: true,
          optional: true,
          bindResultAs: "bt16093Rapidmon",
        },
        {
          effectTextPart:
            "Until the end of your opponent's turn, their effects can't reduce the DP of the Digimon this effect digivolved.",
          kind: "Restrict",
          target: {
            filter: {
              boundRef: "bt16093Rapidmon",
            },
            count: 1,
          },
          restriction: "dpImmune",
          byOpponentEffectsOnly: true,
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart:
            "[Security] You may play 1 level 3 Digimon card with [Terriermon] in its name from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              levels: [3],
              nameOrTrait: [
                {
                  tokens: ["Terriermon"],
                  match: "name",
                },
              ],
            },
            count: 1,
          },
          from: ["hand", "trash"],
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

registerIrCard("BT16-093", compiled);
export { compiled };
