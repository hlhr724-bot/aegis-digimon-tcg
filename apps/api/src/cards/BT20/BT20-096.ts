import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Trash] [Main] If you have 4 or fewer cards in your hand, by paying 6 cost, return this card to the bottom of the deck and delete 1 of your opponent's unsuspended Digimon.",
          kind: "Return",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          to: "deckBottom",
          from: ["trash"],
          condition: {
            kind: "zoneCount",
            seat: "mine",
            zone: "hand",
            op: "lte",
            value: 4,
            raw: "you have 4 or fewer cards in your hand",
          },
          cost: {
            kind: "payMemory",
            memory: 6,
            raw: "by paying 6 cost",
          },
          abortOnDecline: true,
        },
        {
          effectTextPart:
            "[Trash] [Main] If you have 4 or fewer cards in your hand, by paying 6 cost, return this card to the bottom of the deck and delete 1 of your opponent's unsuspended Digimon.",
          kind: "Delete",
          target: {
            filter: {
              kind: ["Digimon"],
              unsuspended: true,
              controller: "opponent",
            },
            count: 1,
            upTo: false,
          },
          condition: {
            kind: "zoneCount",
            seat: "mine",
            zone: "hand",
            op: "lte",
            value: 4,
            raw: "you have 4 or fewer cards in your hand",
          },
        },
      ],
      isFromTrash: true,
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Trash 1 card in your hand.",
          kind: "Trash",
          target: {
            filter: {
              controller: "mine",
              zone: "hand",
            },
            count: 1,
          },
        },
        {
          effectTextPart: "Then, delete 1 of your opponent's level 4 or lower Digimon.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 4,
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
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 6,
              },
            },
            count: 1,
          },
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT20-096", compiled);
