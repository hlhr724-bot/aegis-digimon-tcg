import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Suspend",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Digivolve",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon", "Tamer"],
            },
            count: 1,
          },
          into: {
            controllerDefault: "mine",
            kind: ["Digimon"],
            colors: ["Red", "Green"],
            nameOrTrait: [
              {
                tokens: ["Hybrid"],
                match: "trait",
              },
            ],
          },
          from: ["hand"],
          reduceCost: 1,
          payCost: true,
          optional: true,
        },
      ],
      frequency: "OncePerTurn",
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          leaveCause: "otherThanYourEffect",
          sourceFilter: {
            isSelfRef: true,
          },
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: {
                  hasInheritedEffects: true,
                  controller: "mine",
                  kind: ["Tamer"],
                },
                count: 1,
                source: "thisDigimon",
              },
              from: ["digivolutionCards"],
              payCost: false,
              optional: true,
            },
          ],
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      names: ["Zoe Orimoto"],
      cost: 2,
      isAlternate: true,
    },
    {
      names: ["Zephyrmon"],
      cost: 0,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT18-048", compiled);
