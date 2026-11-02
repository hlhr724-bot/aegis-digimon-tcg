import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          kind: "ModifyDP",
          effectTextPart: "All of your Digimon with ＜Reboot＞ get +1000 DP.",
          playerWide: true,
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              keywords: ["Reboot"],
            },
            count: "all",
          },
          amount: 1000,
          duration: "untilOpponentTurnEnd",
        },
        {
          kind: "GainKeyword",
          effectTextPart: "All of your Digimon with ＜Reboot＞ gain ＜Blocker＞.",
          playerWide: true,
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              keywords: ["Reboot"],
            },
            count: "all",
          },
          keyword: {
            keyword: "Blocker",
            raw: "＜Blocker＞",
          },
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Restrict",
          effectTextPart: "[Security] Your opponent's Digimon can't attack players for the turn.",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: "all",
          },
          restriction: "attackPlayers",
          duration: "forTheTurn",
          whileMatchesTargetFilter: true,
        },
        {
          kind: "AddToHandSelf",
          effectTextPart: "Then, add this card to your hand.",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT5-103", compiled);
