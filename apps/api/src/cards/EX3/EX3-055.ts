import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart:
                "Add 1 purple or red card with the [Free] trait or 1 card with [Imperialdramon] in its name among them to your hand",
              filter: {
                controllerDefault: "mine",
                or: [
                  { colors: ["Red", "Purple"], nameOrTrait: [{ tokens: ["Free"], match: "trait" }] },
                  { nameOrTrait: [{ tokens: ["Imperialdramon"], match: "name" }] },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "trash 1 such card among them.",
              filter: {
                controllerDefault: "mine",
                or: [
                  { colors: ["Red", "Purple"], nameOrTrait: [{ tokens: ["Free"], match: "trait" }] },
                  { nameOrTrait: [{ tokens: ["Imperialdramon"], match: "name" }] },
                ],
              },
              count: 1,
              to: "trash",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      trigger: "AllTurns",
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
              keyword: "Retaliation",
              raw: "＜Retaliation＞",
            },
          },
          while: {
            kind: "youHave",
            filter: {
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Digimon"],
              colors: ["Red"],
            },
            raw: "you have a red Digimon in play",
          },
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX3-055", compiled);
