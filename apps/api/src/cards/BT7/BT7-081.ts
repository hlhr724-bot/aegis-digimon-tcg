import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 5,
          add: [
            {
              effectTextPart: "Add 1 card with [Hybrid] or [Ten Warriors] in its traits",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [{ tokens: ["Hybrid", "Ten Warriors"], match: "traitContains" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 Tamer card among them to your hand.",
              filter: { controllerDefault: "mine", kind: ["Tamer"] },
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
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOneOfYoursDigivolves",
          requireDigivolvedFromTamer: true,
          sourceFilter: { controller: "mine", kind: ["Digimon"], digivolutionStackKind: ["Tamer"] },
          actions: [{ kind: "GainMemory", amount: 2 }],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT7-081", compiled);
