import type { Action, CompiledCard, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const opponentDigimon: Target = { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 };
const anyDigimon: Target = { filter: { controller: "any", kind: ["Digimon"] }, count: 1 };
const suspendedTraits: Target = {
  filter: {
    controller: "mine",
    kind: ["Digimon"],
    suspended: true,
    nameOrTrait: [
      { tokens: ["Insectoid"], match: "trait" },
      { tokens: ["Titan"], match: "trait" },
    ],
  },
  count: "all",
};
const suspendBuff: Action = {
  kind: "CostGatedBlock",
  cost: { kind: "suspend", target: anyDigimon },
  optional: true,
  abortOnDecline: true,
  actions: [
    {
      kind: "Restrict",
      effectTextPart:
        "Your opponent's Option card effects don't affect any of your suspended Digimon with the [Insectoid] or [Titan] trait.",
      target: suspendedTraits,
      restriction: "beAffected",
      duration: "untilOpponentTurnEnd",
      fromSourceKind: ["Option"],
      byOpponentEffectsOnly: true,
      whileMatchesTargetFilter: true,
    },
    {
      kind: "ModifyDP",
      effectTextPart: "All of your suspended Digimon with the [Insectoid] or [Titan] trait get +3000 DP.",
      target: suspendedTraits,
      playerWide: true,
      amount: 3000,
      duration: "untilOpponentTurnEnd",
    },
  ],
};
const battle: Action = {
  kind: "Battle",
  attacker: { filter: { isSelfRef: true }, count: 1, isSelf: true },
  defender: opponentDigimon,
  optional: true,
};
export const compiled: CompiledCard = {
  effects: [
    { trigger: "OnPlay", actions: [battle] },
    { trigger: "WhenDigivolving", actions: [battle] },
    { trigger: "OnPlay", actions: [suspendBuff] },
    { trigger: "WhenDigivolving", actions: [suspendBuff] },
    { trigger: "StartOfYourMainPhase", actions: [suspendBuff] },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 5, traits: ["Insectoid", "TS"], cost: 3, isAlternate: true }],
  assemblyRequirement: [
    {
      reduceCost: 6,
      materials: [{ kinds: ["Digimon"], traits: ["Larva", "Insectoid", "Titan"], count: 4, differentLevels: true }],
    },
  ],
};
registerIrCard("BT26-047", compiled);
export default compiled;
