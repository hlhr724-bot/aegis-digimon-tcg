import type { Action, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const sharedUseKey = "ir-shared-0";

const dpAndBattleActions: Action[] = [
  {
    kind: "ModifyDP",
    target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1, bindAs: "buffedDigimon" },
    amount: 3000,
    duration: "untilOpponentTurnEnd",
  },
  {
    kind: "Battle",
    attacker: {
      filter: { controller: "mine", kind: ["Digimon"] },
      count: 1,
      fromSelectionRef: "buffedDigimon",
    },
    defender: {
      filter: { controller: "opponent", kind: ["Digimon"] },
      count: 1,
    },
  },
];

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Piercing", raw: "＜Piercing＞" }],
    },
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Vortex", raw: "＜Vortex＞" }],
    },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          condition: {
            kind: "youHave",
            filter: {
              zone: ["battleArea", "breeding"],
              controllerDefault: "mine",
              nameOrTrait: [{ tokens: ["NSp"], match: "trait" }],
            },
            raw: "you have an [NSp] trait card in play",
          },
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Restrict",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          restriction: "beAffected",
          fromSourceKind: ["Digimon"],
          byOpponentEffectsOnly: true,
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: dpAndBattleActions,
      optional: true,
      frequency: "OncePerTurn",
      sharedUseKey,
    },
    {
      trigger: "WhenAttacking",
      actions: dpAndBattleActions,
      optional: true,
      frequency: "OncePerTurn",
      sharedUseKey,
    },
    {
      trigger: "Counter",
      actions: dpAndBattleActions,
      optional: true,
      frequency: "OncePerTurn",
      sharedUseKey,
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] 1 of your Digimon may unsuspend.",
          kind: "Unsuspend",
          target: { filter: { controller: "mine", kind: ["Digimon"], suspended: true }, count: 1 },
          optional: true,
        },
        {
          effectTextPart: "Then, suspend 2 of your opponent's Digimon.",
          kind: "Suspend",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 2 },
        },
        {
          effectTextPart: "2 of their Digimon or Tamers can't unsuspend until their turn ends.",
          kind: "Restrict",
          target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 2 },
          restriction: "unsuspend",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { level: 5, texts: ["Angoramon"], cost: 3, isAlternate: true },
    { level: 5, traits: ["NSp"], cost: 3, isAlternate: true },
  ],
};

registerIrCard("EX12-052", compiled);

export { compiled };
