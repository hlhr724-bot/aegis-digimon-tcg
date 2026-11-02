import type { CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const leopardmonTextCard: Filter = {
  controllerDefault: "mine",
  nameOrTrait: [{ tokens: ["Leopardmon"], match: "text" }],
};

const beastAnimalSovereignDigimon: Filter = {
  controllerDefault: "mine",
  kind: ["Digimon"],
  or: [
    { nameOrTrait: [{ tokens: ["Beast", "Sovereign"], match: "traitContains" }] },
    {
      nameOrTrait: [{ tokens: ["Animal"], match: "traitContains" }],
      excludeNameOrTrait: [{ tokens: ["Sea Animal"], match: "trait" }],
    },
  ],
};

export const compiled: CompiledCard = {
  cardId: "EX13-038",
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 card with [Leopardmon] in its text",
              filter: leopardmonTextCard,
              count: 1,
              to: "hand",
            },
            {
              effectTextPart:
                "1 Digimon card with [Beast], [Animal] or [Sovereign], other than [Sea Animal], in any of its traits among them to the hand.",
              filter: beastAnimalSovereignDigimon,
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
          raw: "Reveal the top 3 cards of your deck. Add 1 card with [Leopardmon] in its text and 1 Digimon card with [Beast], [Animal] or [Sovereign], other than [Sea Animal], in any of its traits among them to the hand. Return the rest to the bottom of the deck.",
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
          tokens: ["Beast"],
        },
      ],
    },
    {
      trigger: "AllTurns",
      isInherited: true,
      actions: [
        {
          kind: "Aura",
          target: {
            filter: { controller: "mine", kind: ["Digimon"], suspended: true },
            count: "all",
          },
          effect: { kind: "modifyDP", amount: 1000 },
          raw: "All of your suspended Digimon get +1000 DP",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX13-038", compiled);
