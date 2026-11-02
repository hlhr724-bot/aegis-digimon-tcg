import type { Action, CompiledCard, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const ownDigimon: Target = { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 };
const protect: Action = {
  effectTextPart:
    "[On Play] [When Digivolving] 1 of your Digimon can't be deleted in battle until your opponent's turn ends.",
  kind: "Restrict",
  target: ownDigimon,
  restriction: "beDeletedInBattle",
  duration: "untilOpponentTurnEnd",
};
const blockerWhenPlayedByEffect: Action = {
  effectTextPart: "If played by effects, it also gains ＜Blocker＞.",
  kind: "GainKeyword",
  target: { filter: {}, count: 1, sameTarget: true },
  keyword: { keyword: "Blocker", raw: "＜Blocker＞" },
  duration: "untilOpponentTurnEnd",
  condition: { kind: "triggerEnteredByEffect", raw: "played by effects" },
};

export const compiled: CompiledCard = {
  effects: [
    { trigger: "OnPlay", actions: [protect, blockerWhenPlayedByEffect] },
    { trigger: "WhenDigivolving", actions: [protect] },
    {
      trigger: "Rule",
      actions: [
        {
          kind: "GrantStatic",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          grant: "trait",
          tokens: ["Aquatic"],
          duration: "permanent",
        },
      ],
    },
    { trigger: "Static", isInherited: true, actions: [], keywords: [{ keyword: "Evade", raw: "＜Evade＞" }] },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 3, traits: ["DATA SQUAD"], cost: 2, isAlternate: true }],
};

registerIrCard("BT27-025", compiled);
