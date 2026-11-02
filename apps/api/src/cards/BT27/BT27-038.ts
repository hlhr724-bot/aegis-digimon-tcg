import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const securityMinusDeleteAndWeaken = (trigger: "OnPlay" | "WhenDigivolving" | "WhenAttacking"): CardEffect => ({
  trigger,
  frequency: "OncePerTurn",
  sharedUseKey: "BT27-038/security-delete-weaken",
  actions: [
    {
      kind: "GainKeyword",
      effectTextPart: "Give 1 of your opponent's Digimon ＜Security A. -1＞ until their turn ends.",
      target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
      keyword: { keyword: "SecurityAttack", amount: -1, raw: "＜Security A. -1＞" },
      duration: "untilOpponentTurnEnd",
    },
    {
      kind: "SelectBind",
      effectTextPart: "Then, by choosing 1 of your Digimon",
      target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1, bindAs: "chosenDigimon" },
      optional: true,
      abortOnDecline: true,
    },
    {
      kind: "Delete",
      effectTextPart: "delete the chosen Digimon",
      target: { filter: {}, fromSelectionRef: "chosenDigimon", count: 1 },
    },
    {
      kind: "ModifyDP",
      effectTextPart: "1 of their Digimon gets -6000 DP until their turn ends.",
      target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
      amount: -6000,
      duration: "untilOpponentTurnEnd",
    },
  ],
});

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Armor Purge" }] },
    securityMinusDeleteAndWeaken("OnPlay"),
    securityMinusDeleteAndWeaken("WhenDigivolving"),
    securityMinusDeleteAndWeaken("WhenAttacking"),
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ baseIsTamer: true, traits: ["Kurata's Army"], cost: 2, isAlternate: true }],
};

registerIrCard("BT27-038", compiled);
