import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const suspendDeleteAndLock = (trigger: "OnPlay" | "WhenDigivolving" | "WhenAttacking"): CardEffect => ({
  trigger,
  frequency: "OncePerTurn",
  sharedUseKey: "suspend-delete-lock",
  actions: [
    {
      kind: "Suspend",
      effectTextPart: "You may suspend 1 Digimon.",
      target: { filter: { controllerDefault: "any", kind: ["Digimon"] }, count: 1 },
      optional: true,
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
      kind: "Restrict",
      effectTextPart: "1 of your opponent's Digimon or Tamers can't unsuspend until their turn ends.",
      target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 1 },
      restriction: "unsuspend",
      duration: "untilOpponentTurnEnd",
    },
  ],
});

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Armor Purge" }] },
    suspendDeleteAndLock("OnPlay"),
    suspendDeleteAndLock("WhenDigivolving"),
    suspendDeleteAndLock("WhenAttacking"),
    {
      trigger: "Rule",
      actions: [
        {
          kind: "GrantStatic",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          grant: "trait",
          tokens: ["Dinosaur"],
          duration: "permanent",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ baseIsTamer: true, traits: ["Kurata's Army"], cost: 2, isAlternate: true }],
};

registerIrCard("BT27-048", compiled);
