import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };

const placeChessmonFaceDown = {
  kind: "place",
  target: {
    filter: { controller: "mine", zone: "hand", nameOrTrait: [{ tokens: ["Chessmon"], match: "text" }] },
    count: 1,
  },
  underFilter: self.filter,
  host: "self",
  destination: "digivolutionStack",
  position: "bottom",
  faceDown: true,
  raw: "By placing 1 card with [Chessmon] in its text from your hand face down under this Tamer",
} satisfies Action["cost"];

const suspendAndTrashFaceDown = {
  kind: "compound",
  raw: "By suspending this Tamer and trashing 2 bottom face-down cards from under any of your Tamers",
  costs: [
    { kind: "suspend", target: self },
    {
      kind: "trashBottomFaceDownUnderTamer",
      controller: "mine",
      count: 2,
      raw: "trashing 2 bottom face-down cards from under any of your Tamers",
    },
  ],
} satisfies Action["cost"];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: placeChessmonFaceDown,
          optional: true,
          abortOnDecline: true,
          actions: [
            { kind: "Draw", controller: "mine", amount: 1 },
            { kind: "GainMemory", amount: 1 },
          ],
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: suspendAndTrashFaceDown,
          optional: true,
          abortOnDecline: true,
          actions: [
            {
              effectTextPart:
                "1 of your Digimon may digivolve into a Digimon card with [Chessmon] in its name in the hand with the cost reduced by 2.",
              kind: "Digivolve",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
              into: {
                controllerDefault: "mine",
                zone: "hand",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Chessmon"], match: "name" }],
              },
              from: ["hand"],
              reduceCost: 2,
              payCost: true,
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [{ kind: "PlayWithoutCost", target: self, payCost: false }],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-093", compiled);
