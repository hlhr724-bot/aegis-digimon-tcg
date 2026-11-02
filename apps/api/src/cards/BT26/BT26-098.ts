import type { CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const lalamon: Filter = {
  controller: "mine",
  zone: "battleArea",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Lalamon"], match: "nameExact" }],
};
const sunflowmon: Filter = {
  controller: "mine",
  zone: "trash",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Sunflowmon"], match: "nameExact" }],
};
const lilamon: Filter = {
  controller: "mine",
  zone: "trash",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Lilamon"], match: "nameExact" }],
};
const rosemon: Filter = {
  controller: "mine",
  zone: "hand",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Rosemon"], match: "nameExact" }],
};
const securityPlayable: Filter = {
  controller: "mine",
  zone: ["hand", "trash"],
  kind: ["Digimon", "Tamer"],
  or: [
    { nameOrTrait: [{ tokens: ["Lalamon"], match: "nameExact" }] },
    { nameOrTrait: [{ tokens: ["Yoshino Fujieda"], match: "nameExact" }] },
  ],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "BeforePayCost",
      actions: [
        {
          kind: "ReducePlayCost",
          payment: {
            kind: "payCost",
            cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine" },
          },
          amount: { kind: "fixed", value: 2 },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By placing 1 [Sunflowmon] and 1 [Lilamon] from your trash as 1 of your [Lalamon]'s bottom digivolution cards, that Digimon may digivolve into [Rosemon] in the hand, ignoring digivolution requirements and without paying the cost.",
          kind: "CostGatedBlock",
          cost: {
            kind: "compound",
            costs: [
              {
                kind: "place",
                target: { filter: sunflowmon, count: 1, from: ["trash"] },
                destination: "digivolutionStack",
                host: { filter: lalamon, count: 1 },
                bindHostAs: "lalamonHost",
                position: "bottom",
              },
              {
                kind: "place",
                target: { filter: lilamon, count: 1, from: ["trash"] },
                destination: "digivolutionStack",
                host: { filter: { boundRef: "lalamonHost" }, count: 1 },
                position: "bottom",
              },
            ],
          },
          optional: true,
          abortOnDecline: true,
          actions: [
            {
              kind: "Digivolve",
              target: { filter: lalamon, count: 1, fromSelectionRef: "lalamonHost" },
              into: { filter: rosemon, count: 1 },
              from: ["hand"],
              payCost: false,
              ignoreRequirements: true,
              optional: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [
        {
          effectTextPart:
            "[Security] You may play 1 [Lalamon] or [Yoshino Fujieda] from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: { filter: securityPlayable, count: 1 },
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
        },
        { kind: "AddToHandSelf" },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT26-098", compiled);
