import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenLinking",
      isLinked: true,
      actions: [
        {
          kind: "Suspend",
          target: {
            filter: { controller: "opponent", kind: ["Digimon", "Tamer"] },
            count: 1,
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          kind: "Link",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              hasLinkRequirement: true,
              nameOrTrait: [
                {
                  tokens: ["Social", "Tool", "Game"],
                  match: "trait",
                },
              ],
            },
            count: 1,
            source: "thisDigimon",
          },
          from: ["hand", "digivolutionCards"],
          costDelta: -1,
          optional: true,
        },
      ],
      frequency: "OncePerTurn",
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenLinked",
          sourceFilter: { isSelfRef: true },
          on: {
            filter: { isSelfRef: true },
            count: 1,
            isSelf: true,
          },
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: {
                  controller: "mine",
                  nameOrTrait: [
                    {
                      tokens: ["Kazuki & Itsuki"],
                      match: "nameExact",
                    },
                  ],
                },
                count: 1,
              },
              from: ["hand"],
              payCost: false,
              condition: {
                kind: "permanentCount",
                seat: "mine",
                filter: {
                  controller: "mine",
                  kind: ["Tamer"],
                },
                op: "lte",
                value: 1,
                raw: "you have 1 or fewer Tamers",
              },
              optional: true,
            },
          ],
        },
      ],
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { level: 3, colors: ["Green"], cost: 3, isAlternate: false },
    { level: 3, colors: ["Red"], cost: 3, isAlternate: false },
  ],
  linkRequirement: [{ traits: ["Appmon"], cost: 2 }],
  appFusionRequirement: [
    {
      names: ["Onmon", "Gatchmon"],
      cost: 0,
    },
  ],
};

registerIrCard("BT25-052", compiled);
