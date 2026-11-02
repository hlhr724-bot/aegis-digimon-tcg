import type { Action, CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const ts = {
  controller: "mine",
  kind: ["Digimon", "Tamer"],
  nameOrTrait: [{ tokens: ["TS"], match: "trait" }],
} satisfies Filter;
const iliadOrTs = {
  controller: "mine",
  zone: "hand",
  nameOrTrait: [
    { tokens: ["Iliad"], match: "trait" },
    { tokens: ["TS"], match: "trait" },
  ],
} satisfies Filter;
const opponentLowestDpDigimon = {
  controller: "opponent",
  kind: ["Digimon"],
  superlative: "lowestDP",
} satisfies Filter;

export const compiled: CompiledCard = {
  keywords: [
    { keyword: "Raid", raw: "＜Raid＞" },
    { keyword: "Alliance", raw: "＜Alliance＞" },
    { keyword: "Engage", raw: "＜Engage＞" },
  ],
  effects: [
    {
      trigger: "WhenDigivolving",
      description: "[When Digivolving] Add your top security card to the hand.",
      actions: [
        {
          effectTextPart: "[When Digivolving] Add your top security card to the hand.",
          kind: "SecurityManipulation",
          op: "toHand",
          controller: "mine",
          amount: 1,
          source: "securityTop",
        },
        {
          kind: "Modal",
          choose: 1,
          condition: { kind: "isYourTurn", raw: "if it is your turn" },
          effectTextPart:
            "Then, if it's your turn, you may play or use 1 [Iliad] or [TS] trait card from your hand with the cost reduced by 5.",
          labels: ["Play an Iliad/TS card", "Use an Iliad/TS Option"],
          options: [
            [
              {
                kind: "PlayWithoutCost",
                target: { filter: { ...iliadOrTs, kind: ["Digimon", "Tamer"] }, count: 1 },
                from: ["hand"],
                payCost: true,
                reduceCostBy: 5,
                optional: true,
              },
            ],
            [
              {
                kind: "UseOptionWithoutCost",
                filter: { ...iliadOrTs, kind: ["Option"] },
                from: ["hand"],
                payCost: true,
                reduceCostBy: 5,
                optional: true,
              },
            ],
          ],
          optional: false,
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          mode: "prevent",
          affectsAll: true,
          sourceFilter: ts,
          target: { filter: ts, count: "all" },
          raw: "When your TS Digimon or Tamer would leave, by placing this Digimon's top stacked card as bottom security, it doesn't leave.",
          cost: {
            kind: "placeAsSecurity",
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            position: "bottom",
            detachPermanentTop: true,
          },
          actions: [],
        },
      ],
    },
    {
      trigger: "Static",
      actions: [
        {
          kind: "CostModifier",
          costType: "use",
          mode: "delta",
          amount: 1,
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          handResident: true,
          duration: "permanent",
          scaling: { per: 1, unit: "security", filter: { controller: "mine" } },
        },
      ],
    },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: { kind: "youHave", filter: { ...ts, zone: ["battleArea", "breeding"] } },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Delete all of your opponent's Digimon with the lowest DP.",
          kind: "Delete",
          target: { filter: opponentLowestDpDigimon, count: "all" },
        },
        { effectTextPart: "Then, ＜Recovery +1＞", kind: "Recover", amount: 1 } satisfies Action,
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 5, traits: ["TS"], cost: 4, isAlternate: true }],
};

registerIrCard("BT26-033", compiled);
