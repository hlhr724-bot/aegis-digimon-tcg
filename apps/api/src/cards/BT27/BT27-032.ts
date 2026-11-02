import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Reboot" }, { keyword: "Blocker" }, { keyword: "Evade" }],
    },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: {
            kind: "youHave",
            filter: {
              controller: "mine",
              zone: ["battleArea", "breeding"],
              nameOrTrait: [{ tokens: ["DATA SQUAD"], match: "trait" }],
            },
          },
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Restrict",
          effectTextPart:
            "For every 4 cards your opponent's hand has, 1 of their Digimon or Tamers can't suspend until their turn ends.",
          target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 1 },
          scaling: { per: 4, unit: "cards", filter: { controller: "opponent", zone: "hand" } },
          restriction: "suspend",
          blocksCombatSuspend: true,
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenEffectAddsToOpponentHand",
          actions: [
            {
              kind: "ActivateMain",
              optional: true,
              effectTextPart: "You may activate 1 [Main] effect on this card's Option side.",
            },
          ],
        },
        {
          kind: "SubTrigger",
          event: "whenDigivolutionTrashed",
          sourceFilter: { controller: "mine", kind: ["Tamer"], byEffect: true },
          actions: [
            {
              kind: "ActivateMain",
              optional: true,
              effectTextPart: "You may activate 1 [Main] effect on this card's Option side.",
            },
          ],
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          kind: "Return",
          effectTextPart: "Return 1 of your opponent's highest level Digimon to the hand.",
          target: { filter: { controller: "opponent", kind: ["Digimon"], superlative: "highestLevel" }, count: 1 },
          to: "hand",
        },
      ],
    },
  ],
  digivolutionRequirement: [
    { level: 5, names: ["Gaogamon"], cost: 3, isAlternate: true },
    { level: 5, traits: ["DATA SQUAD"], cost: 3, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-032", compiled);
