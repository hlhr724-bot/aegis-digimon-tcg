import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          kind: "Link",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Social", "Tool", "Game"],
                  match: "trait",
                },
              ],
              hasLinkRequirement: true,
              hostFilter: { isSelfRef: true },
            },
            count: 1,
            orFilters: [
              {
                controller: "mine",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Social", "Tool", "Game"], match: "trait" }],
                hasLinkRequirement: true,
              },
            ],
            source: "thisDigimon",
          },
          from: ["trash", "digivolutionCards"],
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
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          actions: [
            {
              kind: "Delete",
              target: {
                filter: {
                  controller: "opponent",
                  kind: ["Digimon"],
                  playCostLte: 4,
                },
                count: 1,
              },
            },
          ],
          raw: "When this Digimon gets linked, delete 1 of your opponent's Digimon with a play cost of 4 or less",
        },
      ],
      frequency: "OncePerTurn",
    },
    {
      trigger: "Static",
      isLinked: true,
      actions: [
        {
          kind: "SubTrigger",
          event: "whenLinked",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "Restrict",
              target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 1 },
              restriction: "unsuspend",
              duration: "untilOpponentTurnEnd",
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { level: 3, colors: ["Black"], cost: 3, isAlternate: false },
    { level: 3, colors: ["Purple"], cost: 3, isAlternate: false },
  ],
  appFusionRequirement: [
    {
      names: ["Offmon", "Hackmon"],
      cost: 0,
    },
  ],
  linkRequirement: [{ traits: ["Appmon"], cost: 2 }],
};

registerIrCard("BT25-070", compiled);
