import type { CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const qualifying: Filter = {
  controllerDefault: "mine",
  kind: ["Digimon"],
  nameOrTrait: [
    { tokens: ["Evil"], match: "trait" },
    { tokens: ["Dark Dragon"], match: "trait" },
    { tokens: ["Evil Dragon"], match: "trait" },
    { tokens: ["Dark Knight"], match: "trait" },
  ],
};
const qualifyingTamer: Filter = { controllerDefault: "mine", kind: ["Tamer"], colors: ["Purple"] };

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          effectTextPart:
            "[On Play] Reveal the top 3 cards of your deck. Among them, add 1 [Evil], [Dark Dragon], [Evil Dragon] or [Dark Knight] trait card or purple Tamer card to the hand and trash 1 such card. Return the rest to the bottom of the deck.",
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart:
                "add 1 [Evil], [Dark Dragon], [Evil Dragon] or [Dark Knight] trait card or purple Tamer card to the hand",
              filter: qualifying,
              orFilters: [qualifyingTamer],
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "trash 1 such card.",
              filter: qualifying,
              orFilters: [qualifyingTamer],
              count: 1,
              to: "trash",
              requiresMinRevealed: 2,
            },
          ],
          rest: "deckBottom",
        },
        {
          effectTextPart: "Then, trash 1 card in your hand.",
          kind: "Trash",
          target: { filter: { controller: "mine", zone: "hand" }, count: 1 },
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], levels: [3] }, count: 1 },
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ namesExact: ["Gigimon"], cost: 0, isAlternate: true }],
};

registerIrCard("BT24-066", compiled);
