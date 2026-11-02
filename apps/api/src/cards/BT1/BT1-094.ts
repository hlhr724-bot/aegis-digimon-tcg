import type { Action, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const deleteBlocker: Action = {
  effectTextPart: "[Main] Delete 1 of your opponent's Digimon with ＜Blocker＞.",
  kind: "Delete",
  target: { filter: { controller: "opponent", kind: ["Digimon"], keywords: ["Blocker"] }, count: 1 },
};
export const compiled: CompiledCard = {
  effects: [
    { trigger: "Main", actions: [deleteBlocker] },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-094", compiled);
export default compiled;
