import type { Action, CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const TRAIT_UNION: Filter = {
  controllerDefault: "mine",
  nameOrTrait: [{ tokens: ["Holy Beast", "Royal Knight", "DATA SQUAD"], match: "trait" }],
};

const revealAddAndSave = (): Action => ({
  kind: "RevealAdd",
  revealCount: 3,
  add: [
    {
      effectTextPart: "add 1 [Holy Beast], [Royal Knight] or [DATA SQUAD] trait card to the hand",
      filter: TRAIT_UNION,
      count: 1,
      to: "hand",
    },
    {
      effectTextPart: "place 1 such card face down under any of your [DATA SQUAD] trait Tamers.",
      filter: TRAIT_UNION,
      count: 1,
      to: "underTamer",
      faceDown: true,
      underFilter: {
        controller: "mine",
        kind: ["Tamer"],
        nameOrTrait: [{ tokens: ["DATA SQUAD"], match: "trait" }],
      },
      requiresMinRevealed: 2,
    },
  ],
  rest: "deckBottom",
});

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenMoving",
      actions: [revealAddAndSave()],
    },
    {
      trigger: "OnPlay",
      actions: [revealAddAndSave()],
    },
    {
      trigger: "WhenAttacking",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "GainKeyword",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          keyword: { keyword: "SecurityAttack", amount: -1, raw: "＜Security A. -1＞" },
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 2, traits: ["DATA SQUAD"], cost: 0, isAlternate: true }],
};

registerIrCard("EX13-026", compiled);
