import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

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
              effectTextPart: "Add 1 [Maquinamon]",
              filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Maquinamon"], match: "nameExact" }] },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 card with [Maquinamon] in its text among them to the hand.",
              filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Maquinamon"], match: "text" }] },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
        {
          effectTextPart:
            "Then, you may link this Digimon or 1 [Maquinamon] in your hand to 1 of your other Digimon without paying the cost.",
          kind: "Link",
          target: {
            filter: { isSelfRef: true },
            orFilters: [{ controller: "mine", nameOrTrait: [{ tokens: ["Maquinamon"], match: "nameExact" }] }],
            count: 1,
          },
          recipient: {
            filter: { controller: "mine", kind: ["Digimon"], excludeSelf: true },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          optional: true,
        },
      ],
    },
    {
      trigger: "AllTurns",
      isLinked: true,
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          sourceFilter: { isSelfRef: true },
          actions: [],
          cost: {
            kind: "place",
            target: { filter: { isSelfRef: true, zone: "linked" }, from: ["linked"], count: 1 },
            destination: "digivolutionStack",
            position: "bottom",
            host: "self",
            raw: "by placing 1 of its link cards as its bottom digivolution card, it doesn't leave",
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 2, texts: ["Maquinamon"], cost: 0, isAlternate: true }],
};

registerIrCard("EX11-027", compiled);
export default compiled;
