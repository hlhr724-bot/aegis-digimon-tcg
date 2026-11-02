import type { CompiledCard, Filter, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const anyDigimon: Target = { filter: { kind: ["Digimon"] }, count: 1 };
const ts: Filter = {
  controller: "mine",
  zone: ["battleArea", "breeding"],
  nameOrTrait: [{ tokens: ["TS"], match: "trait" }],
};
const bacchusmon: Filter = {
  controller: "mine",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Bacchusmon"], match: "nameExact" }],
};

export const compiled: CompiledCard = {
  keywords: [
    { keyword: "SecurityAttack", amount: 1, raw: "＜Security A. +1＞" },
    { keyword: "Succession", raw: "＜Succession ([Bacchusmon])＞" },
  ],
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Attack",
          target: self,
          withoutSuspending: true,
          optional: true,
          cost: { kind: "suspend", target: anyDigimon },
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], sameOrientationAsSource: true }, count: 1 },
        },
      ],
    },
    {
      trigger: "Static",
      keywordEffect: "Succession",
      actions: [
        {
          kind: "GrantStatic",
          target: self,
          grant: "effects",
          filter: bacchusmon,
          topmostOnly: true,
          excludeKeywords: ["Succession"],
          duration: "permanent",
        },
      ],
    },
    {
      trigger: "Static",
      actions: [{ kind: "WaiveColorRequirement", condition: { kind: "youHave", filter: ts } }],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] You may unsuspend 1 Digimon.",
          kind: "Unsuspend",
          target: anyDigimon,
          optional: true,
        },
        {
          effectTextPart: "Then, delete all of your opponent's unsuspended Digimon with the lowest DP.",
          kind: "Delete",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"], suspended: false, superlative: "lowestDP" },
            count: "all",
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ namesExact: ["Bacchusmon"], basePlayCost: 12, cost: 2, isAlternate: true }],
};

registerIrCard("BT26-080", compiled);
export default compiled;
