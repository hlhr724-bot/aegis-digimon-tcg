import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
    },
    {
      trigger: "WhenDigivolving",
      actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
          },
          fireCondition: {
            kind: "triggerSubjectHasColor",
            filter: { colors: ["Red"] },
          },
          actions: [
            {
              kind: "Digivolve",
              target: {
                filter: {
                  isSelfRef: true,
                },
                count: 1,
                isSelf: true,
              },
              into: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Crescemon"],
                    match: "nameExact",
                  },
                ],
              },
              from: ["trash"],
              reduceCost: 1,
              payCost: true,
              optional: true,
            },
          ],
          raw: "When your Digimon are played, if any of them are red, this Digimon may digivolve into [Crescemon] in the trash with the cost reduced by 1.",
        },
        {
          kind: "SubTrigger",
          event: "whenOneOfYoursDigivolves",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
          },
          fireCondition: {
            kind: "triggerSubjectHasColor",
            filter: { colors: ["Red"] },
          },
          actions: [
            {
              kind: "Digivolve",
              target: {
                filter: {
                  isSelfRef: true,
                },
                count: 1,
                isSelf: true,
              },
              into: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Crescemon"],
                    match: "nameExact",
                  },
                ],
              },
              from: ["trash"],
              reduceCost: 1,
              payCost: true,
              optional: true,
            },
          ],
          raw: "When your Digimon digivolve, if any of them are red, this Digimon may digivolve into [Crescemon] in the trash with the cost reduced by 1.",
        },
      ],
    },
    {
      trigger: "Static",
      actions: [],
      isInherited: true,
      keywords: [
        {
          keyword: "Jamming",
          raw: "＜Jamming＞",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 3,
      traits: ["TS"],
      cost: 2,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT25-024", compiled);
