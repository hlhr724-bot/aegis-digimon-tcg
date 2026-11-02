import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 4,
              },
            },
            count: 1,
          },
          from: ["digivolutionCards"],
          fromOwnDigivolutionStack: true,
          payCost: false,
          optional: true,
        },
      ],
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
          actions: [
            {
              effectTextPart:
                "[Your Turn] [Once Per Turn] When any of your Digimon are played or digivolve, if any of them have the [DS] trait, 2 of your Digimon may DNA digivolve into a Digimon card with the [DS] trait in the hand.",
              kind: "DnaDigivolve",
              materials: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                },
                count: 2,
              },
              into: {
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["DS"],
                    match: "trait",
                  },
                ],
              },
              payCost: false,
              optional: true,
              bindResultAs: "dnaDigivolvedByThisEffect",
              condition: {
                kind: "triggerSubjectMatchesFilter",
                filter: {
                  nameOrTrait: [
                    {
                      tokens: ["DS"],
                      match: "trait",
                    },
                  ],
                },
                raw: "any of them have the [DS] trait",
              },
            },
            {
              effectTextPart: "Then, that DNA digivolved Digimon may attack.",
              kind: "Attack",
              target: {
                filter: {
                  boundRef: "dnaDigivolvedByThisEffect",
                },
                count: 1,
              },
              withoutSuspending: false,
              optional: true,
              condition: {
                kind: "bindingExists",
                ref: "dnaDigivolvedByThisEffect",
                raw: "that DNA digivolved Digimon",
              },
            },
          ],
          raw: "whenPlayed",
        },
        {
          kind: "SubTrigger",
          event: "whenOneOfYoursDigivolves",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
          },
          actions: [
            {
              effectTextPart:
                "[Your Turn] [Once Per Turn] When any of your Digimon are played or digivolve, if any of them have the [DS] trait, 2 of your Digimon may DNA digivolve into a Digimon card with the [DS] trait in the hand.",
              kind: "DnaDigivolve",
              materials: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                },
                count: 2,
              },
              into: {
                kind: ["Digimon"],
                nameOrTrait: [
                  {
                    tokens: ["DS"],
                    match: "trait",
                  },
                ],
              },
              payCost: false,
              optional: true,
              bindResultAs: "dnaDigivolvedByThisEffect",
              condition: {
                kind: "triggerSubjectMatchesFilter",
                filter: {
                  nameOrTrait: [
                    {
                      tokens: ["DS"],
                      match: "trait",
                    },
                  ],
                },
                raw: "any of them have the [DS] trait",
              },
            },
            {
              effectTextPart: "Then, that DNA digivolved Digimon may attack.",
              kind: "Attack",
              target: {
                filter: {
                  boundRef: "dnaDigivolvedByThisEffect",
                },
                count: 1,
              },
              withoutSuspending: false,
              optional: true,
              condition: {
                kind: "bindingExists",
                ref: "dnaDigivolvedByThisEffect",
                raw: "that DNA digivolved Digimon",
              },
            },
          ],
          raw: "whenDigivolving",
        },
      ],
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 5,
      traits: ["DS"],
      cost: 3,
      isAlternate: true,
    },
  ],
};

registerIrCard("EX8-027", compiled);
