import type { Action, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const reveal: Extract<Action, { kind: "RevealAdd" }> = {
  kind: "RevealAdd",
  revealCount: 3,
  add: [
    {
      effectTextPart: "Add 1 card with [Greymon] or [X Antibody] in its name",
      filter: {
        controllerDefault: "mine",
        nameOrTrait: [{ tokens: ["Greymon", "X Antibody"], match: "name" }],
      },
      count: 1,
      to: "hand",
    },
    {
      effectTextPart: "1 black Tamer card among them to your hand.",
      filter: { controllerDefault: "mine", kind: ["Tamer"], colors: ["Black"] },
      count: 1,
      to: "hand",
    },
  ],
  rest: "deckBottom",
};

export const compiled: CompiledCard = {
  effects: [
    { trigger: "OnPlay", actions: [reveal] },
    { trigger: "WhenDigivolving", actions: [reveal] },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          mode: "prevent",
          sourceFilter: { isSelfRef: true },
          leaveCause: "byEffect",
          leaveDestinations: ["trash", "hand", "deck"],
          condition: {
            kind: "selfHasNameContaining",
            names: ["Greymon", "Omnimon"],
            raw: "this Digimon has [Greymon] or [Omnimon] in its name",
          },
          cost: {
            kind: "return",
            target: {
              filter: {
                zone: "digivolutionCards",
                controller: "mine",
                kind: ["Option"],
                nameOrTrait: [{ tokens: ["X Antibody"], match: "nameExact" }],
                hostFilter: { isSelfRef: true },
              },
              count: 1,
            },
            to: "deckBottom",
            raw: "place 1 [X Antibody] from this Digimon's digivolution cards at the bottom of its owner's deck",
          },
          optional: true,
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ namesExact: ["Agumon"], cost: 0, isAlternate: true }],
};

registerIrCard("BT11-062", compiled);
