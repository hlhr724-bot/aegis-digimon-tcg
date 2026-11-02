import type { Action, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const reveal: Extract<Action, { kind: "RevealAdd" }> = {
  kind: "RevealAdd",
  revealCount: 5,
  add: [
    {
      effectTextPart: "Add 1 [Analogman] among them to your hand",
      filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Analogman"], match: "nameExact" }] },
      count: 1,
      to: "hand",
    },
    {
      effectTextPart:
        "add 1 card with [Cyborg] or [Machine] in its traits to your hand or place it under this Digimon as its bottom digivolution card.",
      filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Cyborg", "Machine"], match: "trait" }] },
      count: 1,
      to: "hand",
      orDispositions: [{ to: "placeUnder", underFilter: { isSelfRef: true } }],
    },
  ],
  rest: "trash",
};

export const compiled: CompiledCard = {
  effects: [
    { trigger: "WhenDigivolving", actions: [reveal] },
    { trigger: "OnPlay", actions: [reveal] },
    {
      trigger: "OnDeletion",
      actions: [
        {
          kind: "Return",
          to: "deckBottom",
          target: {
            filter: {
              zone: "battleArea",
              controller: "mine",
              nameOrTrait: [{ tokens: ["Analogman"], match: "nameExact" }],
            },
            count: 1,
          },
          optional: true,
          abortOnDecline: true,
        },
        {
          kind: "PlayWithoutCost",
          condition: { kind: "ifThisEffectActed", raw: "if you placed an Analogman" },
          target: {
            filter: { controller: "mine", nameOrTrait: [{ tokens: ["Machinedramon"], match: "nameExact" }] },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT11-072", compiled);
