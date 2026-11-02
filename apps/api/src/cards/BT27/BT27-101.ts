import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const named = (name: string) => [{ tokens: [name], match: "nameExact" as const }];
const falcomon: Filter = { controller: "mine", zone: "battleArea", kind: ["Digimon"], nameOrTrait: named("Falcomon") };
const peckmon: Filter = { controller: "mine", zone: "trash", kind: ["Digimon"], nameOrTrait: named("Peckmon") };
const crowmon: Filter = { controller: "mine", zone: "trash", kind: ["Digimon"], nameOrTrait: named("Crowmon") };
const ravemon: Filter = { controller: "mine", zone: "trash", kind: ["Digimon"], nameOrTrait: named("Ravemon") };
const securityPlayable: Filter = {
  controller: "mine",
  zone: ["hand", "trash"],
  kind: ["Digimon", "Tamer"],
  or: [{ nameOrTrait: named("Falcomon") }, { nameOrTrait: named("Keenan Crier") }],
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
            "[Main] By placing 1 [Peckmon] and 1 [Crowmon] from your trash as 1 of your [Falcomon]'s bottom digivolution cards, that Digimon may digivolve into [Ravemon] in the trash, ignoring digivolution requirements and without paying the cost.",
          kind: "CostGatedBlock",
          cost: {
            kind: "compound",
            costs: [
              {
                kind: "place",
                target: { filter: peckmon, count: 1, from: ["trash"] },
                destination: "digivolutionStack",
                host: { filter: falcomon, count: 1 },
                bindHostAs: "falcomonHost",
                position: "bottom",
              },
              {
                kind: "place",
                target: { filter: crowmon, count: 1, from: ["trash"] },
                destination: "digivolutionStack",
                host: { filter: { boundRef: "falcomonHost" }, count: 1 },
                position: "bottom",
              },
            ],
          },
          optional: true,
          abortOnDecline: true,
          actions: [
            {
              kind: "Digivolve",
              target: { filter: falcomon, count: 1, fromSelectionRef: "falcomonHost" },
              into: { filter: ravemon, count: 1 },
              from: ["trash"],
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
            "[Security] You may play 1 [Falcomon] or [Keenan Crier] from your hand or trash without paying the cost.",
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

registerIrCard("BT27-101", compiled);
