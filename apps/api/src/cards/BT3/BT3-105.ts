import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] 1 of your Digimon gains ＜Reboot＞ (Unsuspend this Digimon during your opponent's unsuspend phase) and \"This Digimon can't have its DP reduced or be returned to its owner's hand or deck\" until the end of your opponent's next turn.",
          kind: "GainKeyword",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
            bindAs: "breathTarget",
          },
          keyword: {
            keyword: "Reboot",
            raw: "＜Reboot＞",
          },
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] 1 of your Digimon gains ＜Reboot＞ (Unsuspend this Digimon during your opponent's unsuspend phase) and \"This Digimon can't have its DP reduced or be returned to its owner's hand or deck\" until the end of your opponent's next turn.",
          kind: "Restrict",
          target: { filter: {}, count: 1, fromSelectionRef: "breathTarget" },
          restriction: "dpImmune",
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] 1 of your Digimon gains ＜Reboot＞ (Unsuspend this Digimon during your opponent's unsuspend phase) and \"This Digimon can't have its DP reduced or be returned to its owner's hand or deck\" until the end of your opponent's next turn.",
          kind: "Restrict",
          target: { filter: {}, count: 1, fromSelectionRef: "breathTarget" },
          restriction: "beReturned",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Restrict",
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
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT3-105", compiled);
