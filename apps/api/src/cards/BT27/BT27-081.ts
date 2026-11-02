import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const discardText =
  "[On Play] [When Digivolving] [When Attacking] [Once Per Turn] If your opponent's hand has 6 or more cards, they trash 1 card in their hand.";
const paymentText = "Then, by trashing 2 bottom face-down cards from under any of your Tamers,";
const playText =
  "you may play or use 1 [DATA SQUAD] trait card with a play or use cost of 5 or less from your hand without paying the cost.";
const revivalText =
  "[On Deletion] You may play 1 play cost 5 or lower card with [Avian] or [Bird] in any of its traits or the [DATA SQUAD] trait from your trash without paying the cost.";

const discardThenPlay: Action[] = [
  {
    kind: "Trash",
    effectTextPart: discardText,
    condition: { kind: "zoneCount", seat: "opponent", zone: "hand", op: "gte", value: 6 },
    target: { filter: { controller: "opponent", zone: "hand" }, count: 1 },
    chooser: "opponent",
  },
  {
    kind: "CostGatedBlock",
    effectTextPart: paymentText,
    optional: true,
    abortOnDecline: true,
    cost: {
      kind: "trashBottomFaceDownUnderTamer",
      controller: "mine",
      count: 2,
      raw: "By trashing 2 bottom face-down cards from under any of your Tamers",
    },
    actions: [
      {
        kind: "PlayWithoutCost",
        effectTextPart: playText,
        chooseDualMode: true,
        target: {
          filter: {
            controller: "mine",
            kind: ["Digimon", "Tamer", "Option"],
            nameOrTrait: [{ tokens: ["DATA SQUAD"], match: "trait" }],
            playCostLte: 5,
          },
          count: 1,
        },
        from: ["hand"],
        payCost: false,
        optional: true,
      },
    ],
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "OnPlay", frequency: "OncePerTurn", sharedUseKey: "discardThenPlay", actions: discardThenPlay },
    { trigger: "WhenDigivolving", frequency: "OncePerTurn", sharedUseKey: "discardThenPlay", actions: discardThenPlay },
    { trigger: "WhenAttacking", frequency: "OncePerTurn", sharedUseKey: "discardThenPlay", actions: discardThenPlay },
    {
      trigger: "OnDeletion",
      isInherited: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          effectTextPart: revivalText,
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon", "Tamer"],
              playCostLte: 5,
              or: [
                { nameOrTrait: [{ tokens: ["Avian", "Bird"], match: "traitContains" }] },
                { nameOrTrait: [{ tokens: ["DATA SQUAD"], match: "trait" }] },
              ],
            },
            count: 1,
          },
          from: ["trash"],
          payCost: false,
          optional: true,
        },
      ],
    },
  ],
  digivolutionRequirement: [{ level: 4, traits: ["DATA SQUAD"], cost: 3, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-081", compiled);
