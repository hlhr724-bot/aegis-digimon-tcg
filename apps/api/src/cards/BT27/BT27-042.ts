import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import type { AssemblyRequirement } from "@aegis/shared/effects/ir/requirements/fusion";
import { registerIrCard } from "#api/engine/effects/interpreter";

const chessmonName = [{ tokens: ["Chessmon"], match: "name" as const }];

const chessmonDigimonInHand: Filter = {
  controller: "mine",
  zone: "hand",
  kind: ["Digimon"],
  playCostLte: 7,
  nameOrTrait: chessmonName,
};

const playChessmon: Action = {
  kind: "PlayWithoutCost",
  effectTextPart:
    "[On Play] [When Digivolving] You may play 1 play cost 7 or lower Digimon card with [Chessmon] in its name from your hand without paying the cost.",
  target: { filter: chessmonDigimonInHand, count: 1 },
  from: ["hand"],
  payCost: false,
  optional: true,
};

const playChessmonWindow = (trigger: "OnPlay" | "WhenDigivolving"): CardEffect => ({
  trigger,
  actions: [playChessmon],
});

const chessmonAssembly: AssemblyRequirement = {
  reduceCost: 5,
  materials: [5, 4, 3].map((level) => ({ count: 1, level, nameOrTrait: chessmonName })),
};

export const compiled: CompiledCard = {
  effects: [
    playChessmonWindow("OnPlay"),
    playChessmonWindow("WhenDigivolving"),
    {
      trigger: "OnDeletion",
      actions: [
        {
          kind: "SecurityManipulation",
          effectTextPart: "[On Deletion] ＜Recovery +1＞.",
          op: "addTop",
          controller: "mine",
          source: "deck",
          amount: 1,
        },
        {
          kind: "PlayWithoutCost",
          effectTextPart:
            "Then, by suspending 1 of your [QueenChessmon], you may play this card from your trash to the breeding area without paying the cost.",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          from: ["trash"],
          payCost: false,
          breeding: true,
          optional: true,
          abortOnDecline: true,
          cost: {
            kind: "suspend",
            target: {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["QueenChessmon"], match: "nameExact" }],
              },
              count: 1,
            },
            raw: "by suspending 1 of your [QueenChessmon]",
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { level: 5, names: ["Chessmon"], cost: 3, isAlternate: true },
    { level: 5, traits: ["DATA SQUAD"], cost: 3, isAlternate: true },
  ],
  assemblyRequirement: [chessmonAssembly],
};

registerIrCard("BT27-042", compiled);
