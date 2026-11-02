import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const levelFourOrLower = { kind: ["Digimon" as const], levelComparison: { op: "lte" as const, value: 4 } };
const entranceActions = [
  {
    kind: "Trash" as const,
    effectTextPart: "[On Play] [When Digivolving] Trash 1 card in your hand.",
    target: { filter: { controller: "mine" as const, zone: "hand" as const }, count: 1 },
  },
  {
    kind: "PlaceUnder" as const,
    effectTextPart:
      "Then, you may place 1 card with [Gammamon] in its text from your trash as this Digimon's bottom digivolution card.",
    target: {
      filter: {
        zone: "trash" as const,
        controller: "mine" as const,
        nameOrTrait: [{ tokens: ["Gammamon"], match: "text" as const }],
      },
      count: 1,
      from: ["trash" as const],
    },
    position: "bottom" as const,
    optional: true,
  },
];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Counter",
      actions: [],
      isFromHand: true,
      keywords: [{ keyword: "BlastDigivolve", raw: "＜Blast Digivolve＞" }],
    },
    { trigger: "OnPlay", actions: entranceActions },
    { trigger: "WhenDigivolving", actions: entranceActions },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "onAddDigivolutionCards",
          raw: "when an effect adds digivolution cards to this Digimon",
          sourceFilter: { isSelfRef: true, byEffect: true },
          actions: [
            {
              kind: "PlayWithoutCost",
              target: {
                filter: { ...levelFourOrLower, zone: "trash", controller: "mine" },
                count: 1,
              },
              from: ["trash"],
              payCost: false,
              optional: true,
              abortOnDecline: true,
              cost: {
                kind: "deleteOwn",
                target: { filter: { ...levelFourOrLower, controllerDefault: "any" as const }, count: 1 },
                raw: "by deleting 1 level 4 or lower Digimon",
              },
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 4, names: ["Gammamon"], cost: 3, isAlternate: true }],
};

registerIrCard("LM-017", compiled);
