import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          condition: {
            kind: "youHave",
            filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Digimon"] },
            raw: "you have a Digimon in play",
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [{ kind: "GainMemory", amount: 1 }, { kind: "AddToHandSelf" }],
      isSecurity: true,
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Place this card under 1 of your Digimon without [X Antibody] in its digivolution cards as its bottom digivolution card.",
          kind: "PlaceUnder",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          underFilter: {
            controller: "mine",
            kind: ["Digimon"],
            digivolutionStackNameOrTrait: [{ tokens: ["X Antibody"], match: "nameExact", negate: true }],
          },
          position: "bottom",
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Restrict",
          target: {
            filter: {
              zone: "digivolutionCards",
              isSelfRef: true,
              nameOrTrait: [{ tokens: ["X Antibody"], match: "nameExact" }],
            },
            count: "all",
          },
          restriction: "beTrashed",
          duration: "forTheTurn",
        },
      ],
      isInherited: true,
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Digivolve",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          into: { controllerDefault: "mine", kind: ["Digimon"], traits: ["X Antibody"] },
          from: ["hand"],
          payCost: true,
          optional: true,
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT9-109", compiled);
