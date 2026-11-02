import type { CompiledCard, Cost, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const host = {
  controller: "mine",
  zone: "battleArea",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Gaomon"], match: "nameExact" }],
} satisfies Filter;
const first = {
  kind: "place",
  target: {
    filter: { controller: "mine", nameOrTrait: [{ tokens: ["Gaogamon"], match: "nameExact" }] },
    from: ["trash"],
    count: 1,
  },
  destination: "digivolutionStack",
  position: "bottom",
  host: { filter: host, count: 1 },
  bindHostAs: "gaomonHost",
} satisfies Cost;
const second = {
  kind: "place",
  target: {
    filter: { controller: "mine", nameOrTrait: [{ tokens: ["MachGaogamon"], match: "nameExact" }] },
    from: ["trash"],
    count: 1,
  },
  destination: "digivolutionStack",
  position: "bottom",
  host: { filter: { boundRef: "gaomonHost" }, count: 1 },
} satisfies Cost;
const playThomasFilter = {
  kind: ["Tamer"],
  nameOrTrait: [{ tokens: ["Thomas H. Norstein"], match: "nameExact" }],
} satisfies Filter;
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          mode: "reduceCost",
          amount: 2,
          sourceFilter: { isSelfRef: true },
          cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 1 },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By placing 1 [Gaogamon] and 1 [MachGaogamon] from your trash as 1 of your [Gaomon]'s bottom digivolution cards, that Digimon may digivolve into [MirageGaogamon] in the hand, ignoring digivolution requirements and without paying the cost.",
          kind: "CostGatedBlock",
          cost: { kind: "compound", costs: [first, second], orderPlacedCards: true },
          optional: true,
          abortOnDecline: true,
          actions: [
            {
              kind: "Digivolve",
              target: { filter: host, count: 1, fromSelectionRef: "gaomonHost" },
              into: {
                controller: "mine",
                nameOrTrait: [{ tokens: ["MirageGaogamon"], match: "nameExact" }],
              },
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
            "[Security] You may play 1 [Gaomon] or [Thomas H. Norstein] from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Gaomon"], match: "nameExact" }],
            },
            orFilters: [{ controller: "mine", ...playThomasFilter }],
            count: 1,
            upTo: true,
          },
          from: ["hand", "trash"],
          payCost: false,
        },
        { kind: "AddToHandSelf" },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT25-096", compiled);
