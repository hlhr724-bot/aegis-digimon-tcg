import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          effectTextPart: "[On Play] ＜Draw 1＞. (Draw 1 card from your deck.)",
          kind: "Draw",
          controller: "mine",
          amount: 1,
        },
        {
          effectTextPart: "Then, for each Digimon your opponent has in play, ＜Draw 1＞.",
          kind: "Draw",
          controller: "mine",
          amount: 1,
          scaling: {
            per: 1,
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              zone: "battleArea",
            },
            unit: "cards",
          },
        },
      ],
    },
    {
      trigger: "OnDeletion",
      actions: [
        {
          kind: "PlaceUnder",
          underFilter: { controller: "mine", kind: ["Tamer"], excludeToken: true },
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
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
            kind: "modifyDP",
            amount: 1000,
          },
          while: {
            kind: "opponentHas",
            filter: {
              controllerDefault: "opponent",
              kind: ["Digimon"],
              zone: "battleArea",
            },
            count: 2,
            raw: "your opponent has 2 or more Digimon in play",
          },
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT10-020", compiled);
