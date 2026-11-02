import type { CompiledCard, Filter, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const tsOption: Filter = {
  controller: "mine",
  zone: "hand",
  kind: ["Option"],
  nameOrTrait: [{ tokens: ["TS"], match: "trait" }],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "GainMemory",
          amount: 1,
          condition: { kind: "memoryAtMost", controller: "mine", value: 4, raw: "you have 4 or less memory" },
        },
      ],
    },
    {
      trigger: "EndOfYourTurn",
      actions: [
        {
          kind: "UseOptionWithoutCost",
          filter: tsOption,
          target: { filter: tsOption, count: 1 },
          from: ["hand"],
          payCost: true,
          reduceCostByOpponentMemory: true,
          optional: true,
          cost: { kind: "suspend", target: self, raw: "By suspending this Tamer" },
          raw: "For each point of memory your opponent has, reduce this effect's paid cost by 1.",
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [
        { kind: "PlayWithoutCost", target: { filter: { isSelfRef: true }, count: 1, isSelf: true }, payCost: false },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT26-090", compiled);
export default compiled;
