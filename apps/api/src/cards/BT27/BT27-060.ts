import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const protectedMamemon: Target = { fromSelectionRef: "protectedMamemon", filter: {}, count: 1 };

const protectMamemon: Action[] = [
  {
    kind: "SelectBind",
    effectTextPart:
      "Until your opponent's turn ends, 1 of your Digimon with [Mamemon] in its name gains ＜Blocker＞ and their effects can't return it to hands or decks.",
    target: {
      filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["Mamemon"], match: "name" }] },
      count: 1,
      bindAs: "protectedMamemon",
    },
  },
  {
    kind: "GainKeyword",
    target: protectedMamemon,
    keyword: { keyword: "Blocker", raw: "＜Blocker＞" },
    duration: "untilOpponentTurnEnd",
  },
  {
    kind: "Restrict",
    target: protectedMamemon,
    restriction: "cannotReturnToHandOrDeck",
    byOpponentEffectsOnly: true,
    duration: "untilOpponentTurnEnd",
  },
];

export const compiled: CompiledCard = {
  effects: [
    ...(["OnPlay", "WhenDigivolving", "OnDeletion"] as const).map((trigger): CardEffect => ({
      trigger,
      actions: protectMamemon,
    })),
    { trigger: "Static", isInherited: true, actions: [], keywords: [{ keyword: "Blocker", raw: "＜Blocker＞" }] },
  ],
  digivolutionRequirement: [{ namesExact: ["Thundermon"], cost: 0, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-060", compiled);
