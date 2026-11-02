import type { Action, CardEffect, CompiledCard, Condition, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const theirDigimon: Filter = { controller: "opponent", kind: ["Digimon"], zone: "battleArea" };

const crowdedSecurity: Condition = {
  kind: "totalSecurityCount",
  op: "gte",
  value: 7,
  raw: "there are 7 or more total cards in both players' security stacks",
};
const thinSecurity: Condition = {
  kind: "totalSecurityCount",
  op: "lte",
  value: 6,
  raw: "there are 6 or fewer total cards in both players' security stacks",
};

const dpDrop = (): Action[] => [
  {
    kind: "ModifyDP",
    target: { filter: theirDigimon, count: 1 },
    amount: -7000,
    duration: "forTheTurn",
    condition: crowdedSecurity,
    raw: "1 of your opponent's Digimon gets -7000 DP for the turn",
  },
  {
    kind: "ModifyDP",
    playerWide: true,
    effectTextPart: "All of your opponent's Digimon get -7000 DP.",
    target: { filter: theirDigimon, count: "all" },
    amount: -7000,
    duration: "forTheTurn",
    condition: thinSecurity,
    raw: "all of their Digimon get -7000 DP for the turn",
  },
];

const placeOneEach = (): Action[] => [
  {
    kind: "SecurityManipulation",
    op: "placeAsSecurity",
    controller: "mine",
    source: { filter: { controller: "mine", kind: ["Digimon"], zone: "battleArea" }, count: 1 },
    ownerSecurity: true,
    toTop: true,
    optional: true,
    abortOnDecline: true,
    raw: "you may place 1 of your Digimon as the top security card",
  },
  {
    kind: "SecurityManipulation",
    op: "placeAsSecurity",
    controller: "opponent",
    source: { filter: theirDigimon, count: 1 },
    ownerSecurity: true,
    toTop: true,
    raw: "place 1 of your opponent's Digimon as the top security card",
  },
];

const PLACEMENT_USE_KEY = "EX13-036/place-one-each-as-security";

const placementEffect = (trigger: "WhenDigivolving" | "EndOfAttack" | "Counter"): CardEffect => ({
  trigger,
  frequency: "OncePerTurn",
  sharedUseKey: PLACEMENT_USE_KEY,
  description:
    "[When Digivolving] [End of Attack] [Counter] [Once Per Turn] You may place 1 of each player's Digimon as the top security cards.",
  actions: placeOneEach(),
});

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Security",
      isSecurity: true,
      description:
        "[Security] 1 of your opponent's Digimon gets -7000 DP for the turn. If there are 6 or fewer total cards in both players' security stacks, instead all of their Digimon get -7000 DP for the turn.",
      actions: dpDrop(),
    },
    { trigger: "OnPlay", actions: dpDrop() },
    {
      trigger: "WhenDigivolving",
      description:
        "[When Digivolving] By trashing the top security card of 1 player with the most security cards, you may activate 1 of this Digimon's [Security] effects.",
      actions: [
        {
          kind: "RecoverByTrashingMostSecurity",
          recover: false,
          raw: "by trashing the top security card of 1 player with the most security cards",
        },
        {
          kind: "ReactivateEffect",
          fromTrigger: "Security",
          count: 1,
          condition: { kind: "ifThisEffectActed", raw: "a security card was trashed" },
          raw: "you may activate 1 of this Digimon's [Security] effects",
        },
      ],
    },
    placementEffect("WhenDigivolving"),
    placementEffect("EndOfAttack"),
    placementEffect("Counter"),
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 5, traits: ["Holy Beast", "DATA SQUAD"], cost: 3, isAlternate: true }],
  assemblyRequirement: [
    {
      reduceCost: 5,
      materials: [
        { level: 5, colors: ["Yellow"], traits: ["Holy Beast"], count: 1 },
        { level: 4, colors: ["Yellow"], traits: ["Holy Beast"], count: 1 },
        { level: 3, colors: ["Yellow"], traits: ["Holy Beast"], count: 1 },
      ],
    },
  ],
};

registerIrCard("EX13-036", compiled);
