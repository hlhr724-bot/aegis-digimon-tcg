import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const revealExamonCards: Action = {
  kind: "RevealAdd",
  revealCount: 3,
  add: [
    {
      effectTextPart: "Add 1 Digimon card with [Examon] in its text",
      filter: {
        controllerDefault: "mine",
        kind: ["Digimon"],
        nameOrTrait: [{ tokens: ["Examon"], match: "text" }],
      },
      count: 1,
      to: "hand",
    },
    {
      effectTextPart: "1 such Option card among them to the hand.",
      filter: {
        controllerDefault: "mine",
        kind: ["Option"],
        nameOrTrait: [{ tokens: ["Examon"], match: "text" }],
      },
      count: 1,
      to: "hand",
    },
  ],
  rest: "deckBottom",
};

export const compiled: CompiledCard = {
  effects: [
    { trigger: "OnPlay", actions: [revealExamonCards] },
    { trigger: "WhenDigivolving", actions: [revealExamonCards] },
    {
      trigger: "EndOfYourTurn",
      isInherited: true,
      actions: [
        {
          kind: "DnaDigivolve",
          materials: [
            { filter: { isSelfRef: true }, count: 1, zone: "battleArea" },
            { filter: { controller: "mine", kind: ["Digimon"], excludeSelf: true }, count: 1, zone: "battleArea" },
          ],
          into: { controllerDefault: "mine", kind: ["Digimon"], zone: "hand", hasDnaDigivolutionRequirement: true },
          payCost: true,
          optional: true,
        },
      ],
    },
  ],
  digivolutionRequirement: [{ namesExact: ["Dracomon"], cost: 0, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-021", compiled);
