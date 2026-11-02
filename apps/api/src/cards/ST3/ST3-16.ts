import type { Action, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const main: Action = {
  effectTextPart: "[Main] 1 of your opponent's Digimon gets -10000 DP for the turn.",
  kind: "ModifyDP",
  target: { filter: { controllerDefault: "opponent", kind: ["Digimon"] }, count: 1 },
  amount: -10000,
  duration: "forTheTurn",
};
const compiled: CompiledCard = {
  effects: [
    { trigger: "Main", actions: [main] },
    { trigger: "Security", actions: [main], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST3-16", compiled);
export { compiled };
