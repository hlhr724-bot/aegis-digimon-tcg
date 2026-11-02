import type { CompiledCard, SubTriggerEvent } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By deleting 1 of your Digimon, delete 1 of your opponent's Digimon whose level is less than or equal.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "lte",
                relativeTo: "lastDeleted",
              },
            },
            count: 1,
          },
          cost: {
            kind: "deleteOwn",
            target: {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
              },
              count: 1,
            },
            bindResultAs: "deleted",
            raw: "By deleting 1 of your Digimon",
          },
          optional: true,
          abortOnDecline: true,
        },
        {
          effectTextPart:
            "If one of your Digimon with [Ravemon] in its name was deleted by this effect, at the end of your opponent's turn, play 1 [Ravemon] from your trash without paying the cost.",
          kind: "SubTrigger",
          event: "endOfOpponentTurn" as SubTriggerEvent,
          once: true,
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: {
                  nameOrTrait: [
                    {
                      tokens: ["Ravemon"],
                      match: "nameExact",
                    },
                  ],
                },
                count: 1,
                location: "trash",
                controller: "mine",
              },
              from: ["trash"],
              payCost: false,
            },
          ],
          condition: {
            kind: "bindingContains",
            ref: "deleted",
            filter: { nameOrTrait: [{ tokens: ["Ravemon"], match: "name" }] },
            raw: "one of your Digimon with [Ravemon] in its name was deleted by this effect",
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "lowestLevel",
            },
            count: 1,
          },
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX4-071", compiled);
