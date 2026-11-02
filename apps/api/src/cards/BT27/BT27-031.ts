import type { Action, CardEffect, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const placeThenReturn: Action = {
  kind: "CostGatedBlock",
  cost: {
    kind: "place",
    targetIsPermanent: true,
    target: { filter: { controller: "mine", excludeSelf: true, kind: ["Digimon", "Tamer"] }, count: 1 },
    raw: "By placing 1 of your other Digimon or Tamers as this Digimon's bottom digivolution card",
    destination: "digivolutionStack",
    position: "bottom",
    host: "self",
  },
  optional: true,
  abortOnDecline: true,
  actions: [
    {
      effectTextPart:
        "return 1 of your opponent's Digimon with as many digivolution cards as this Digimon or fewer to the bottom of the deck.",
      kind: "Return",
      target: {
        filter: { controller: "opponent", kind: ["Digimon"], digivolutionCardsCompareToSource: "lte" },
        count: 1,
      },
      to: "deckBottom",
    },
  ],
};

const placeBody = (trigger: CardEffect["trigger"]): CardEffect => ({
  trigger,
  frequency: "OncePerTurn",
  sharedUseKey: "BT27-031/place-once-per-turn",
  description:
    "[On Play] [When Digivolving] [Counter] [Once Per Turn] By placing 1 of your other Digimon or Tamers as this Digimon's bottom digivolution card, return 1 of your opponent's Digimon with as many digivolution cards as this Digimon or fewer to the bottom of the deck.",
  actions: [placeThenReturn],
});

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Decode", raw: "＜Decode (Lv.5 w/[Aquatic]/[DATA SQUAD] trait)＞" }],
    },
    {
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
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  hostFilter: { isSelfRef: true },
                  levelComparison: { op: "eq", value: 5 },
                  nameOrTrait: [{ tokens: ["Aquatic", "DATA SQUAD"], match: "trait" }],
                },
                count: 1,
              },
              from: ["digivolutionCards"],
              payCost: false,
              playedByDecode: true,
              optional: true,
            },
          ],
        },
      ],
    },
    placeBody("OnPlay"),
    placeBody("WhenDigivolving"),
    placeBody("Counter"),
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "onAddDigivolutionCards",
          sourceFilter: { isSelfRef: true, byEffect: true },
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon", "Tamer"],
                  colors: ["Blue"],
                  playCostLte: 5,
                  hostFilter: { isSelfRef: true },
                },
                count: 1,
              },
              from: ["digivolutionCards"],
              payCost: false,
              optional: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "Rule",
      actions: [
        {
          kind: "GrantStatic",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          grant: "trait",
          tokens: ["Aquatic"],
          duration: "permanent",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 5, traits: ["DATA SQUAD"], cost: 4, isAlternate: true }],
};

registerIrCard("BT27-031", compiled);
