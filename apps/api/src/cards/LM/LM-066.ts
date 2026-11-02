import type { Action, CompiledCard, Filter, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const anyDigimon: Target = { filter: { kind: ["Digimon"] }, count: 1 };
const anyCostDigimon: Filter = { controller: "any", kind: ["Digimon"] };
const opponentDigimon: Filter = { controller: "opponent", kind: ["Digimon"] };
const suspendedDigimon: Filter = { controller: "any", kind: ["Digimon"], suspended: true };

const unsuspendThenBattle: Action[] = [
  {
    kind: "Unsuspend",
    target: anyDigimon,
    optional: true,
    effectTextPart: "You may unsuspend 1 Digimon.",
  },
  {
    kind: "Battle",
    attacker: self,
    target: { filter: opponentDigimon, count: 1 },
    optional: true,
    effectTextPart: "Then, this Digimon may battle 1 of your opponent's Digimon.",
  },
];

export const compiled: CompiledCard = {
  cardId: "LM-066",
  keywords: [
    { keyword: "Piercing", raw: "＜Piercing＞" },
    { keyword: "Vortex", raw: "＜Vortex＞" },
    { keyword: "Blocker", raw: "＜Blocker＞" },
  ],
  effects: [
    {
      trigger: "WhenDigivolving",
      frequency: "OncePerTurn",
      sharedUseKey: "LM-066/unsuspend-then-battle",
      description:
        "[When Digivolving] [When Attacking] [Once Per Turn] You may unsuspend 1 Digimon. Then, this Digimon may battle 1 of your opponent's Digimon.",
      actions: unsuspendThenBattle,
    },
    {
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      sharedUseKey: "LM-066/unsuspend-then-battle",
      description:
        "[When Digivolving] [When Attacking] [Once Per Turn] You may unsuspend 1 Digimon. Then, this Digimon may battle 1 of your opponent's Digimon.",
      actions: unsuspendThenBattle,
    },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      description:
        "[All Turns] [Once Per Turn] When this Digimon would leave the battle area other than by your effects, by suspending 1 Digimon, it doesn't leave.",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          mode: "prevent",
          leaveCause: "otherThanYourEffect",
          sourceFilter: { isSelfRef: true },
          actions: [],
          cost: {
            kind: "suspend",
            target: { filter: anyCostDigimon, count: 1 },
            raw: "by suspending 1 Digimon, it doesn't leave",
          },
        },
      ],
    },
    {
      trigger: "BeforePayCost",
      condition: { kind: "wouldBeUsedAsOption" },
      description: "When this card would be used, by suspending 2 Digimon, reduce the cost by 2.",
      actions: [
        {
          kind: "ReducePlayCost",
          payment: {
            kind: "payCost",
            cost: { kind: "suspend", target: { filter: anyCostDigimon, count: 2 } },
          },
          amount: { kind: "fixed", value: 2 },
        },
      ],
    },
    {
      trigger: "Main",
      description:
        "[Main] 1 of your opponent's Digimon or Tamers can't unsuspend until their turn ends. Then, for every 2 suspended Digimon, return 1 of their Digimon to the bottom of the deck.",
      actions: [
        {
          effectTextPart: "[Main] 1 of your opponent's Digimon or Tamers can't unsuspend until their turn ends.",
          kind: "SelectBind",
          target: {
            filter: { controller: "opponent", kind: ["Digimon", "Tamer"] },
            count: 1,
            bindAs: "unsuspendLocked",
          },
        },
        {
          effectTextPart: "[Main] 1 of your opponent's Digimon or Tamers can't unsuspend until their turn ends.",
          kind: "Restrict",
          target: { fromSelectionRef: "unsuspendLocked", filter: {}, count: 1 },
          restriction: "unsuspend",
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart: "Then, for every 2 suspended Digimon, return 1 of their Digimon to the bottom of the deck.",
          kind: "Return",
          to: "deckBottom",
          target: {
            filter: opponentDigimon,
            count: 0,
            countModifier: {
              amount: 1,
              scaling: { per: 2, unit: "cards", filter: suspendedDigimon },
            },
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ traits: ["Vortex Warriors"], basePlayCostMin: 11, cost: 2, isAlternate: true }],
};

registerIrCard("LM-066", compiled);
