import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const suspendThenActivateMain: Action[] = [
  {
    kind: "Suspend",
    effectTextPart: "You may suspend up to 3 Digimon or Tamers.",
    target: { filter: { controllerDefault: "any", kind: ["Digimon", "Tamer"] }, count: 3, upTo: true },
    optional: true,
  },
  {
    kind: "CostGatedBlock",
    effectTextPart:
      "Then, by trashing 1 [Examon] or [X Antibody] from this Digimon's digivolution cards, activate 1 [Main] effect on this card's Option side.",
    optional: true,
    cost: {
      kind: "trash",
      target: {
        filter: {
          isSelfRef: true,
          zone: "digivolutionCards",
          nameOrTrait: [{ tokens: ["Examon", "X Antibody"], match: "nameExact" }],
        },
        count: 1,
      },
    },
    actions: [{ kind: "ActivateMain" }],
  },
];

const suspendThenActivateMainOn = (trigger: CardEffect["trigger"]): CardEffect => ({
  trigger,
  frequency: "OncePerTurn",
  sharedUseKey: "BT27-034/suspend-activate-main",
  actions: suspendThenActivateMain,
});

const decode = (color: "Green" | "Blue"): CardEffect => ({
  trigger: "AllTurns",
  actions: [
    {
      kind: "Replacement",
      event: "wouldLeavePlay",
      leaveCause: "otherThanBattle",
      sourceFilter: { isSelfRef: true },
      actions: [
        {
          kind: "PlayWithoutCost",
          target: { filter: { controller: "mine", kind: ["Digimon"], levels: [5], colors: [color] }, count: 1 },
          fromOwnDigivolutionStack: true,
          payCost: false,
          optional: true,
          playedByDecode: true,
        },
      ],
    },
  ],
});

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        { keyword: "Raid" },
        { keyword: "Piercing" },
        { keyword: "SecurityAttack", amount: 1, raw: "＜Security A. +1＞" },
        { keyword: "Blocker" },
        { keyword: "Evade" },
      ],
    },
    {
      trigger: "Static",
      actions: [],
      keywords: [
        { keyword: "Decode", raw: "＜Decode (Green Lv.5)＞" },
        { keyword: "Decode", raw: "＜Decode (Blue Lv.5)＞" },
      ],
    },
    decode("Green"),
    decode("Blue"),
    suspendThenActivateMainOn("WhenDigivolving"),
    suspendThenActivateMainOn("WhenAttacking"),
    suspendThenActivateMainOn("Counter"),
    {
      trigger: "Main",
      actions: [
        {
          kind: "Delete",
          effectTextPart:
            "[Main] Delete up to 9000 DP's total worth of your opponent's Digimon. For each of their Digimon and Tamers, add 3000 to this effect's DP maximum.",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all", upTo: true, totalDpCap: 9000 },
          totalDpCapScaling: {
            per: 1,
            filter: { controller: "opponent", kind: ["Digimon", "Tamer"] },
            unit: "cards",
            amount: 3000,
          },
        },
        {
          kind: "Trash",
          effectTextPart: "If this effect didn't delete, trash 1 of their Option cards in the battle area.",
          target: { filter: { zone: "battleArea", controller: "opponent", kind: ["Option"] }, count: 1 },
          condition: { kind: "ifThisEffectDidNotDelete", raw: "this effect didn't delete" },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ namesExact: ["Examon"], cost: 2, isAlternate: true }],
};

registerIrCard("BT27-034", compiled);
