import type { Action, CompiledCard, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const opponentDigimon: Target = { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 };

const placeThenDraw = {
  kind: "Draw",
  controller: "mine",
  amount: 1,
  cost: {
    kind: "place",
    target: {
      filter: {
        controller: "mine",
        kind: ["Digimon"],
        levelComparison: { op: "lte", value: 4 },
        nameOrTrait: [{ tokens: ["Aquatic", "DATA SQUAD"], match: "trait" }],
      },
      count: 1,
      from: ["hand"],
    },
    destination: "digivolutionStack",
    position: "bottom",
    host: {
      filter: { controller: "mine", kind: ["Digimon"] },
      orFilters: [{ controller: "mine", kind: ["Tamer"], nameOrTrait: [{ tokens: ["DATA SQUAD"], match: "trait" }] }],
      count: 1,
    },
    faceDownUnderTamer: true,
    raw: "By placing 1 level 4 or lower [Aquatic] or [DATA SQUAD] trait Digimon card from your hand as any of your Digimon's bottom digivolution card, or face down under any of your [DATA SQUAD] trait Tamers",
  },
  optional: true,
  abortOnDecline: true,
} satisfies Action;

const trashTopOrBottom = {
  kind: "Modal",
  choose: 1,
  labels: ["Trash the top digivolution card", "Trash the bottom digivolution card"],
  options: [
    [{ kind: "TrashDigivolution", target: opponentDigimon, amount: 1, fromTop: true }],
    [{ kind: "TrashDigivolution", target: opponentDigimon, amount: 1, fromTop: false }],
  ],
} satisfies Action;

export const compiled: CompiledCard = {
  effects: [
    { trigger: "OnPlay", actions: [placeThenDraw] },
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
    { trigger: "WhenAttacking", isInherited: true, frequency: "OncePerTurn", actions: [trashTopOrBottom] },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 2, traits: ["DATA SQUAD"], cost: 0, isAlternate: true }],
};

registerIrCard("BT27-020", compiled);
