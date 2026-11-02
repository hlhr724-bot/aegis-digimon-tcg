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
              effectTextPart:
                "You may play 1 Digimon card with [Legend-Arms] in its traits and a play cost of 7 or less among them without paying its memory cost.",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                playCostLte: 7,
                nameOrTrait: [
                  {
                    tokens: ["Legend-Arms"],
                    match: "trait",
                  },
                ],
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
              filter: {
                isSelfRef: true,
              },
              count: 1,
              isSelf: true,
            },
            raw: "By placing this Digimon under 1 of your other Digimon that's red or has [Legend-Arms] in its traits as its bottom digivolution card",
            underFilter: {
              or: [
                {
                  colors: ["Red"],
                },
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
      trigger: "OpponentsTurn",
      actions: [
        {
          kind: "Aura",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          effect: {
            kind: "keyword",
            keyword: {
              keyword: "Blocker",
              raw: "＜Blocker＞",
            },
          },
          while: {
            kind: "youHave",
            filter: {
              or: [
                {
                  colors: ["Red"],
                },
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
            raw: "you have a Digimon that's red or has [Legend-Arms] in its traits in play",
          },
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST13-09", compiled);
