import type { Action, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const main: Action[] = [
  {
    effectTextPart: "[Main] Unsuspend 1 of your Digimon.",
    kind: "Unsuspend",
    target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
  },
  {
    effectTextPart:
      "Until the end of your opponent's next turn, that Digimon gains ＜Blocker＞. (When an opponent's Digimon attacks, you may suspend this Digimon to force the opponent to attack it instead.)",
    kind: "GainKeyword",
    target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1, sameTarget: true },
    keyword: { keyword: "Blocker" },
    duration: "untilOpponentTurnEnd",
  },
];
const security: Action[] = [
  { kind: "Unsuspend", target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 } },
  {
    kind: "GainKeyword",
    target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1, sameTarget: true },
    keyword: { keyword: "Blocker" },
    duration: "forTheTurn",
  },
];
export const compiled: CompiledCard = {
  effects: [
    { trigger: "Main", actions: main },
    { trigger: "Security", actions: security, isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-095", compiled);
export default compiled;
