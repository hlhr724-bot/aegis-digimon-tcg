import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
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
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Digimon", "Tamer"],
              colors: ["Green"],
            },
            raw: "you have a green Digimon or Tamer in play",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Delete 1 of your opponent's level 3 Digimon.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levels: [3],
            },
            count: 1,
          },
        },
        { effectTextPart: "Then place this card in your battle area.", kind: "PlaceInBattleAreaSelf" },
      ],
    },
    {
      trigger: "Main",
      keywords: [
        {
          keyword: "Delay",
          raw: "＜Delay＞",
        },
      ],
      actions: [
        {
          effectTextPart: "Your opponent may trash 1 Option card in their hand.",
          kind: "Trash",
          target: {
            filter: {
              controller: "opponent",
              zone: "hand",
              kind: ["Option"],
            },
            count: 1,
          },
          optional: true,
          chooser: "opponent",
          controller: "opponent",
        },
        {
          effectTextPart: "If they do not trash a card, gain 2 memory.",
          kind: "GainMemory",
          amount: 2,
          condition: {
            kind: "ifThisEffectDidNotAct",
            raw: "if opponent did not trash an Option card",
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
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

registerIrCard("EX4-070", compiled);
