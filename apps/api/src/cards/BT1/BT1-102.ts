import type { Action, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const drawPerSecurity: Action = {
  effectTextPart: "[Main] Trigger ＜Draw 1＞ (Draw 1 card from your deck) for every 2 security cards you have.",
  kind: "Draw",
  controller: "mine",
  amount: 1,
  scaling: { per: 2, unit: "security", filter: { controller: "mine" } },
};
export const compiled: CompiledCard = {
  effects: [
    { trigger: "Main", actions: [drawPerSecurity] },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-102", compiled);
export default compiled;
