import type { Action, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const trashAll: Action = {
  effectTextPart: "[Main] Trash all digivolution cards under all of your opponent's Digimon.",
  kind: "TrashDigivolution",
  target: { filter: { controller: "opponent", kind: ["Digimon"], digivolutionCards: "hasAny" }, count: "all" },
  amount: "all",
};
export const compiled: CompiledCard = {
  effects: [
    { trigger: "Main", actions: [trashAll] },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT1-101", compiled);
export default compiled;
