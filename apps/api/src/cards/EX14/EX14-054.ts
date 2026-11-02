import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const playAndDiscard: Action[] = [
  {
    kind: "PlayWithoutCost",
    effectTextPart:
      "You may play 1 play cost 6 or lower [Evil], [Wizard], [Fallen Angel] or [Greed] trait Digimon card from your trash without paying the cost.",
    target: {
      filter: {
        controller: "mine",
        kind: ["Digimon"],
        playCostLte: 6,
        nameOrTrait: [{ tokens: ["Evil", "Wizard", "Fallen Angel", "Greed"], match: "trait" }],
      },
      count: 1,
    },
    from: ["trash"],
    payCost: false,
    optional: true,
  },
  {
    kind: "Trash",
    effectTextPart: "Then, your opponent trashes 1 card in their hand.",
    chooser: "opponent",
    target: { filter: { controller: "opponent", zone: "hand" }, count: 1 },
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Alliance" }, { keyword: "Engage" }] },
    { trigger: "OnPlay", frequency: "OncePerTurn", sharedUseKey: "play-discard", actions: playAndDiscard },
    { trigger: "WhenDigivolving", frequency: "OncePerTurn", sharedUseKey: "play-discard", actions: playAndDiscard },
    { trigger: "WhenAttacking", frequency: "OncePerTurn", sharedUseKey: "play-discard", actions: playAndDiscard },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          effectTextPart:
            "When your opponent's hand is trashed from, you may delete all of their lowest level Digimon.",
          event: "whenHandTrashed",
          fireCondition: { kind: "triggerHandTrashedSeat", seat: "opponent" },
          optional: true,
          actions: [
            {
              kind: "Delete",
              effectTextPart:
                "When your opponent's hand is trashed from, you may delete all of their lowest level Digimon.",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestLevel" },
                count: "all",
              },
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 5, traits: ["Fallen Angel", "Greed"], cost: 3, isAlternate: true }],
  assemblyRequirement: [{ materials: [{ traits: ["Greed"], count: 3, differentLevels: true }], reduceCost: 5 }],
};

registerIrCard("EX14-054", compiled);
