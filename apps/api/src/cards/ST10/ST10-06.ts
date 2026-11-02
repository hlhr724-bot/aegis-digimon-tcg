import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart:
            "[When Digivolving] Place 1 yellow or purple Digimon card from your trash on top of your security stack face down. When DNA digivolving, search your security stack, and you may play 1 level 5 or lower Digimon card among it without paying its cost.",
          kind: "SecurityManipulation",
          op: "placeAsSecurity",
          controller: "mine",
          source: {
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              colors: ["Yellow", "Purple"],
            },
            count: 1,
          },
          from: ["trash"],
          toTop: true,
          faceDown: true,
        },
        {
          effectTextPart:
            "[When Digivolving] Place 1 yellow or purple Digimon card from your trash on top of your security stack face down. When DNA digivolving, search your security stack, and you may play 1 level 5 or lower Digimon card among it without paying its cost.",
          kind: "SearchSecurity",
          target: {
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                value: 5,
              },
            },
            count: 1,
          },
          then: {
            kind: "PlayWithoutCost",
            source: "security",
            payCost: false,
            optional: true,
          },
          condition: {
            kind: "isDnaDigivolving",
          },
        },
        {
          effectTextPart: "Then, shuffle your security stack.",
          kind: "SecurityManipulation",
          op: "shuffle",
          controller: "mine",
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: {
            controllerDefault: "mine",
            excludeSelf: true,
            byEffect: true,
            kind: ["Digimon"],
          },
          actions: [
            {
              kind: "Delete",
              target: {
                filter: {
                  controller: "opponent",
                  kind: ["Digimon"],
                  levelLteTriggerSource: true,
                },
                count: 1,
              },
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  dnaDigivolveRequirement: [
    {
      cost: 0,
      materials: [
        {
          color: "Yellow",
          level: 5,
        },
        {
          color: "Purple",
          level: 5,
        },
      ],
    },
  ],
};

registerIrCard("ST10-06", compiled);
