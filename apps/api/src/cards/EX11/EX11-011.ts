import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        { keyword: "SecurityAttack", amount: 1, raw: "＜Security Attack +1＞" },
        { keyword: "Fortitude", raw: "＜Fortitude＞" },
      ],
    },
    {
      trigger: "OnPlay",
      actions: [
        {
          effectTextPart: "[On Play] [When Digivolving] You may suspend 1 Digimon.",
          kind: "Suspend",
          target: {
            filter: {
              controllerDefault: "any",
              kind: ["Digimon"],
            },
            count: 1,
          },
          optional: true,
        },
        {
          effectTextPart:
            "Then, choose 1 of each player's Digimon with the highest play cost and delete all other Digimon.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              superlative: "highestPlayCost",
            },
            count: 1,
            bindAs: "sparedMine",
          },
        },
        {
          effectTextPart:
            "Then, choose 1 of each player's Digimon with the highest play cost and delete all other Digimon.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "highestPlayCost",
            },
            count: 1,
            bindAs: "sparedOpponent",
          },
        },
        {
          effectTextPart:
            "Then, choose 1 of each player's Digimon with the highest play cost and delete all other Digimon.",
          kind: "Delete",
          target: {
            filter: {
              kind: ["Digimon"],
              excludeSelectionRef: ["sparedMine", "sparedOpponent"],
            },
            count: "all",
          },
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart: "[On Play] [When Digivolving] You may suspend 1 Digimon.",
          kind: "Suspend",
          target: {
            filter: {
              controllerDefault: "any",
              kind: ["Digimon"],
            },
            count: 1,
          },
          optional: true,
        },
        {
          effectTextPart:
            "Then, choose 1 of each player's Digimon with the highest play cost and delete all other Digimon.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              superlative: "highestPlayCost",
            },
            count: 1,
            bindAs: "sparedMine",
          },
        },
        {
          effectTextPart:
            "Then, choose 1 of each player's Digimon with the highest play cost and delete all other Digimon.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              superlative: "highestPlayCost",
            },
            count: 1,
            bindAs: "sparedOpponent",
          },
        },
        {
          effectTextPart:
            "Then, choose 1 of each player's Digimon with the highest play cost and delete all other Digimon.",
          kind: "Delete",
          target: {
            filter: {
              kind: ["Digimon"],
              excludeSelectionRef: ["sparedMine", "sparedOpponent"],
            },
            count: "all",
          },
        },
      ],
    },
    {
      trigger: "OpponentsTurn",
      actions: [
        {
          kind: "Aura",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: "all",
          },
          effect: {
            kind: "restriction",
            restriction: "attackOnlySuspendedDigimon",
          },
          while: {
            kind: "selfIsSuspended",
            raw: "this Digimon is suspended",
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 5,
      names: ["Tyrannomon"],
      cost: 4,
      isAlternate: true,
    },
    {
      traits: ["Dinosaur"],
      cost: 4,
      isAlternate: true,
      level: 5,
    },
  ],
};

registerIrCard("EX11-011", compiled);
