import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "Draw",
          controller: "mine",
          amount: 2,
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Hero"],
                    match: "trait",
                  },
                ],
              },
              orFilters: [
                {
                  zone: "hand",
                  controller: "mine",
                  keywords: ["Save"],
                },
              ],
              count: 1,
            },
            raw: "By trashing 1 card with ＜Save＞ in its text or the [Hero] trait from your hand",
          },
          optional: true,
          abortOnDecline: true,
        },
      ],
    },
    {
      trigger: "OnDeletion",
      actions: [
        {
          kind: "PlaceUnder",
          underFilter: { controller: "mine", kind: ["Tamer"], excludeToken: true },
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          optional: true,
        },
      ],
      keywords: [
        {
          keyword: "Save",
          raw: "＜Save＞",
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "ModifyDP",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          amount: 2000,
          duration: "permanent",
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 2,
      texts: ["Save"],
      cost: 0,
      isAlternate: true,
    },
    {
      traits: ["Hero"],
      cost: 0,
      isAlternate: true,
      level: 2,
    },
  ],
};

registerIrCard("BT21-063", compiled);
