import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const trashSourcesDeleteAndLock = (trigger: "OnPlay" | "WhenDigivolving" | "WhenAttacking"): CardEffect => ({
  trigger,
  frequency: "OncePerTurn",
  sharedUseKey: "BT27-026/trash-delete-lock",
  actions: [
    {
      kind: "TrashDigivolution",
      effectTextPart: "You may trash any 2 digivolution cards from your opponent's Digimon.",
      target: { filter: { controller: "opponent", kind: ["Digimon"], digivolutionCards: "hasAny" }, count: "all" },
      amount: 2,
      scope: "acrossDigimon",
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
      effectTextPart: "1 of their Digimon can't suspend until their turn ends.",
      target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
      restriction: "suspend",
      duration: "untilOpponentTurnEnd",
    },
  ],
});

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Armor Purge" }] },
    trashSourcesDeleteAndLock("OnPlay"),
    trashSourcesDeleteAndLock("WhenDigivolving"),
    trashSourcesDeleteAndLock("WhenAttacking"),
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ baseIsTamer: true, traits: ["Kurata's Army"], cost: 2, isAlternate: true }],
};

registerIrCard("BT27-026", compiled);
