import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart:
                "Add up to 1 [Snatchmon], [Destromon], [Galacticmon], or [Fusionize] among them to your hand",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  { tokens: ["Snatchmon", "Destromon", "Galacticmon"], match: "nameExact" },
                  { tokens: ["Fusionize"], match: "nameExact" },
                ],
              },
              count: 1,
              to: "hand",
              upTo: true,
            },
            {
              effectTextPart: "place 1 [Vemmon] among them under this Digimon as its bottom digivolution card.",
              filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Vemmon"], match: "nameExact" }] },
              count: 1,
              to: "placeUnder",
              underFilter: { isSelfRef: true },
            },
          ],
          rest: "deckBottom",
          cost: {
            kind: "suspend",
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            raw: "By suspending this Digimon",
          },
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldDigivolve",
          sourceFilter: { isSelfRef: true },
          into: {
            controllerDefault: "mine",
            nameOrTrait: [{ tokens: ["Destromon", "Galacticmon"], match: "nameExact" }],
          },
          actions: [{ kind: "Replacement", event: "wouldDigivolve", mode: "reduceCost", amount: 1 }],
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT11-061", compiled);
