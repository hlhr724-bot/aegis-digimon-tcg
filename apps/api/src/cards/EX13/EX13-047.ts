import type { CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const royalKnightCard: Filter = {
  controllerDefault: "mine",
  nameOrTrait: [{ tokens: ["Royal Knight"], match: "trait" }],
};

const blockerCard: Filter = {
  controllerDefault: "mine",
  keywords: ["Blocker"],
};

export const compiled: CompiledCard = {
  cardId: "EX13-047",
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Blocker", raw: "＜Blocker＞" }],
    },
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 card with the [Royal Knight] trait",
              filter: royalKnightCard,
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 card with ＜Blocker＞ among them to the hand.",
              filter: blockerCard,
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
          raw: "Reveal the top 3 cards of your deck. Add 1 card with the [Royal Knight] trait and 1 card with ＜Blocker＞ among them to the hand. Return the rest to the bottom of the deck",
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [{ kind: "GainMemory", amount: -2, raw: "Lose 2 memory" }],
    },
    {
      trigger: "OpponentsTurn",
      isInherited: true,
      actions: [
        {
          kind: "ModifyDP",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          amount: 2000,
          duration: "permanent",
          raw: "This Digimon gets +2000 DP",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX13-047", compiled);
