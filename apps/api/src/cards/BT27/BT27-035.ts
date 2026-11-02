import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const reduceHandAndSecurity: Action[] = [
  {
    kind: "Return",
    effectTextPart:
      "by returning cards without looking to the bottom of the deck so that it has 7 left, return their top security card to the bottom of the deck.",
    target: { filter: { controller: "opponent", zone: "security", position: "top" }, count: 1 },
    to: "deckBottom",
    condition: { kind: "handAtLeast", controller: "opponent", value: 8 },
    optional: true,
    cost: {
      kind: "return",
      target: { filter: { controller: "opponent", zone: "hand" }, count: "all" },
      to: "deckBottom",
      leaveInZone: 7,
      selectionHidden: true,
    },
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Reboot" }, { keyword: "Blocker" }, { keyword: "Evade" }] },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: {
            kind: "youHave",
            filter: { controller: "mine", nameOrTrait: [{ tokens: ["DATA SQUAD"], match: "trait" }] },
          },
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      frequency: "OncePerTurn",
      sharedUseKey: "activate-main",
      optional: true,
      actions: [
        { kind: "ActivateMain", effectTextPart: "You may activate 1 [Main] effect on this card's Option side." },
      ],
    },
    {
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      sharedUseKey: "activate-main",
      optional: true,
      actions: [
        { kind: "ActivateMain", effectTextPart: "You may activate 1 [Main] effect on this card's Option side." },
      ],
    },
    { trigger: "WhenDigivolving", actions: reduceHandAndSecurity },
    { trigger: "WhenAttacking", actions: reduceHandAndSecurity },
    {
      trigger: "Main",
      actions: [
        {
          kind: "Return",
          effectTextPart: "Return 1 of your opponent's Digimon to the hand.",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          to: "hand",
        },
        {
          kind: "Unsuspend",
          effectTextPart: "Then, if their hand has 8 or more cards, 1 of your Digimon may unsuspend.",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          optional: true,
          condition: { kind: "handAtLeast", controller: "opponent", value: 8 },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { level: 6, traits: ["DATA SQUAD"], cost: 5, isAlternate: true },
    {
      namesExact: ["MirageGaogamon"],
      cost: 0,
      isAlternate: true,
      burstDigivolve: { returnTamerNamesExact: ["Thomas H. Norstein"] },
    },
  ],
};

registerIrCard("BT27-035", compiled);
