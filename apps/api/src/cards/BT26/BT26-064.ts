import type { CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const evil = {
  nameOrTrait: [{ tokens: ["Fallen Angel", "Undead", "Wizard", "Demon Lord"], match: "trait" }],
} satisfies Filter;
const ts = { nameOrTrait: [{ tokens: ["TS"], match: "trait" }] } satisfies Filter;
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 card with the [Fallen Angel], [Undead], [Wizard] or [Demon Lord] trait",
              filter: evil,
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 card with the [TS] trait among them to the hand.",
              filter: ts,
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        { kind: "Draw", controller: "mine", amount: 1 },
        { kind: "Trash", target: { count: 1, filter: { controller: "mine", zone: "hand" } }, optional: false },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 2, traits: ["TS"], cost: 0, isAlternate: true }],
};
registerIrCard("BT26-064", compiled);
