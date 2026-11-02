import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "lowestDP",
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
            raw: "By deleting 1 of your Digimon",
          },
          raw: "By deleting 1 of your Digimon, delete 1 of your opponent's Digimon with the lowest DP.",
          optional: true,
          abortOnDecline: true,
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "lowestDP",
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
            raw: "By deleting 1 of your Digimon",
          },
          raw: "By deleting 1 of your Digimon, delete 1 of your opponent's Digimon with the lowest DP.",
          optional: true,
          abortOnDecline: true,
        },
      ],
    },
    {
      trigger: "OnDeletion",
      actions: [
        {
          kind: "DnaDigivolve",
          materials: {
            filter: {
              zone: "battleArea",
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Machinedramon"],
                  match: "nameExact",
                },
              ],
            },
            count: 1,
          },
          into: {
            controllerDefault: "mine",
            zone: "hand",
            kind: ["Digimon"],
            nameOrTrait: [
              {
                tokens: ["Millenniummon"],
                match: "nameExact",
              },
            ],
            hasDnaDigivolutionRequirement: true,
          },
          payCost: true,
          optional: true,
          looseMaterials: {
            filter: {
              zone: "trash",
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Kimeramon"],
                  match: "nameExact",
                },
              ],
            },
            count: 1,
            from: ["trash"],
          },
          raw: "DNA digivolve 1 [Machinedramon] in play and 1 [Kimeramon] in your trash into [Millenniummon] in your hand.",
        },
      ],
    },
    {
      trigger: "Static",
      actions: [],
      isInherited: true,
      keywords: [
        {
          keyword: "SecurityAttack",
          amount: 1,
          raw: "＜Security Attack +1＞",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 4,
      traits: ["Composite"],
      cost: 3,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT18-015", compiled);
