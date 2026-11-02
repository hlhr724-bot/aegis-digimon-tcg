import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 1,
          add: [
            {
              effectTextPart: "you may play it without paying its memory cost.",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["Legend-Arms"],
                    match: "trait",
                  },
                ],
                playCostLte: 7,
              },
              count: 1,
              to: "play",
              optional: true,
            },
            {
              effectTextPart: "Add the rest to your hand.",
              filter: {
                controllerDefault: "mine",
              },
              count: "all",
              to: "hand",
            },
          ],
          rest: "deckBottom",
          cost: {
            kind: "place",
            destination: "digivolutionStack",
            targetIsPermanent: true,
            host: "target",
            position: "bottom",
            target: {
              filter: { isSelfRef: true },
              count: 1,
              isSelf: true,
            },
            raw: "By placing this Digimon under 1 of your other Digimon that's black or has [Legend-Arms] in its traits as its bottom digivolution card",
            underFilter: {
              or: [
                { colors: ["Black"] },
                {
                  nameOrTrait: [
                    {
                      tokens: ["Legend-Arms"],
                      match: "trait",
                    },
                  ],
                },
              ],
              controller: "mine",
              excludeSelf: true,
              kind: ["Digimon"],
            },
          },
          optional: true,
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: {
                op: "lte",
                value: 3000,
              },
            },
            count: 1,
          },
          condition: {
            kind: "youHave",
            filter: {
              or: [
                { colors: ["Black"] },
                {
                  nameOrTrait: [
                    {
                      tokens: ["Legend-Arms"],
                      match: "trait",
                    },
                  ],
                },
              ],
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Digimon"],
            },
            raw: "you have a Digimon that's black or has [Legend-Arms] in its traits in play",
          },
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST13-02", compiled);
