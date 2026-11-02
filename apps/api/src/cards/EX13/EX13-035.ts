import type { Action, CardEffect, CompiledCard, Condition, Cost, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const NAME_TOKENS = ["Chuumon", "Sukamon", "Etemon"] as const;

const playablePool = (playCostMaximum: number): Filter => ({
  controller: "mine",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: [...NAME_TOKENS], match: "name" }],
  playCostLte: playCostMaximum,
});

const returnTenSuchCards: Cost = {
  kind: "return",
  target: {
    filter: {
      zone: "trash",
      controller: "mine",
      nameOrTrait: [{ tokens: [...NAME_TOKENS], match: "name" }],
    },
    count: 10,
  },
  to: "deckBottom",
  raw: "by returning 10 such cards from your trash to the bottom of the deck",
};

const playFree = (playCostMaximum: number, cost?: Cost): Action => ({
  kind: "PlayWithoutCost",
  target: {
    filter: playablePool(playCostMaximum),
    count: 2,
    upTo: true,
    totalPlayCostBudget: playCostMaximum,
  },
  from: ["hand", "trash"],
  payCost: false,
  ...(cost === undefined ? {} : { cost }),
  raw: `play up to 2 Digimon cards with [Chuumon], [Sukamon] or [Etemon] in their names and up to ${playCostMaximum} total play cost from your hand or trash without paying the costs`,
});

const playClause = (trigger: "OnPlay" | "WhenDigivolving"): CardEffect => ({
  trigger,
  actions: [
    {
      kind: "Modal",
      choose: 1,
      optional: true,
      labels: [
        "play up to 2 such cards with up to 6 total play cost",
        "return 10 such cards from your trash to the bottom of the deck, then play up to 2 such cards with up to 12 total play cost",
      ],
      options: [[playFree(6)], [playFree(12, returnTenSuchCards)]],
      raw: "You may play up to 2 Digimon cards with [Chuumon], [Sukamon] or [Etemon] in their names and up to 6 total play cost from your hand or trash without paying the costs. By returning 10 such cards from your trash to the bottom of the deck, add 6 to the play cost maximum.",
    },
  ],
});

const threeOrMoreNamed: Condition = {
  kind: "anyHas",
  filter: {
    zone: "battleArea",
    kind: ["Digimon"],
    nameOrTrait: [{ tokens: ["Sukamon", "Etemon"], match: "name" }],
  },
  countMin: 3,
  raw: "there are 3 or more Digimon with [Sukamon] or [Etemon] in their names",
};

const opponentDigimon: Filter = { controller: "opponent", kind: ["Digimon"] };

const securityAttackDebuff: Action = {
  kind: "Aura",
  target: { filter: opponentDigimon, count: "all" },
  effect: { kind: "keyword", keyword: { keyword: "SecurityAttack", amount: -1, raw: "＜Security A. -1＞" } },
  while: threeOrMoreNamed,
  raw: "give all of your opponent's Digimon ＜Security A. -1＞",
};

const dpDebuff: Action = {
  kind: "Aura",
  target: { filter: opponentDigimon, count: "all" },
  effect: { kind: "modifyDP", amount: -3000 },
  while: threeOrMoreNamed,
  raw: "give all of your opponent's Digimon -3000 DP",
};

export const compiled: CompiledCard = {
  effects: [
    playClause("OnPlay"),
    playClause("WhenDigivolving"),
    { trigger: "AllTurns", actions: [securityAttackDebuff, dpDebuff] },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 5, names: ["Sukamon", "Etemon"], cost: 4, isAlternate: true }],
};

registerIrCard("EX13-035", compiled);
