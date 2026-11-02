import type { Action, CompiledCard, Filter, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const ownDigimon: Filter = { controller: "mine", kind: ["Digimon"] };
const ownDigimonOrTamer: Filter = { controller: "mine", kind: ["Digimon", "Tamer"] };
const opponentDigimon: Filter = { controller: "opponent", kind: ["Digimon"] };

const battleOrRecovery: Action = {
  kind: "Modal",
  choose: 1,
  chooseScaling: { per: 2, unit: "colors", filter: ownDigimonOrTamer },
  options: [
    [{ kind: "Battle", attacker: self, defender: { filter: opponentDigimon, count: 1 }, optional: true }],
    [
      {
        kind: "Recover",
        amount: 1,
        cost: {
          kind: "return",
          target: { filter: { controller: "opponent", zone: "trash" }, count: 5 },
          to: "deckBottom",
          optional: true,
          raw: "By returning 5 cards from your opponent's trash to the bottom of the deck",
        },
      },
    ],
  ],
  labels: ["Battle", "Recovery +1"],
  raw: "For every 2 of your Digimon and Tamers' colors, activate 1 effect below",
};

const onPlayOrDigivolve: Action[] = [
  {
    effectTextPart: "[On Play] [When Digivolving] 1 of your Digimon may attack without suspending.",
    kind: "Attack",
    target: { filter: ownDigimon, count: 1 },
    withoutSuspending: true,
    optional: true,
  },
  battleOrRecovery,
];

export const compiled: CompiledCard = {
  cardId: "EX13-077",
  effects: [
    { trigger: "OnPlay", actions: onPlayOrDigivolve },
    { trigger: "WhenDigivolving", actions: onPlayOrDigivolve },
    {
      trigger: "Static",
      actions: [
        {
          kind: "GrantStatic",
          target: self,
          grant: "hasAllDigivolutionColors",
          duration: "permanent",
          raw: "This Digimon gains all colors in its digivolution cards",
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "ModifyDP",
          target: self,
          amount: 1000,
          duration: "permanent",
          scaling: { per: 1, unit: "colors", filter: ownDigimonOrTamer },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ namesExact: ["Omnimon"], cost: 2, isAlternate: true }],
  assemblyRequirement: [
    {
      reduceCost: 8,
      materials: [
        {
          count: 6,
          kinds: ["Digimon"],
          nameOrTrait: [{ tokens: ["ADVENTURE"], match: "trait" }],
          differentColors: true,
        },
      ],
    },
  ],
};

registerIrCard("EX13-077", compiled);
