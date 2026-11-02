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
              effectTextPart: "Add 1 card with the [Hybrid]/[Ten Warriors] trait",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [{ tokens: ["Hybrid", "Ten Warriors"], match: "trait" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 red Tamer card with inherited effects among them to the hand.",
              filter: { hasInheritedEffects: true, controllerDefault: "mine", kind: ["Tamer"], colors: ["Red"] },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOneOfYoursDigivolves",
          sourceFilter: {
            controllerDefault: "mine",
            kind: ["Digimon", "Tamer"],
            nameOrTrait: [{ tokens: ["Hybrid", "Ten Warriors"], match: "trait" }],
          },
          actions: [{ kind: "GainMemory", amount: 1 }],
          raw: "when any of your Digimon or Tamers digivolve into a Digimon with the [Hybrid]/[Ten Warriors] trait",
        },
      ],
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT18-010", compiled);
