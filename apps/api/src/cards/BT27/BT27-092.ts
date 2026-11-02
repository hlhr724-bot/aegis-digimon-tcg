import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };

const kurataArmy = [{ tokens: ["Kurata's Army"], match: "trait" as const }];

const placeKurataFaceDown = {
  kind: "place",
  target: {
    filter: { controller: "mine", zone: "hand", nameOrTrait: kurataArmy },
    count: 1,
  },
  underFilter: self.filter,
  host: "self",
  destination: "digivolutionStack",
  position: "bottom",
  faceDown: true,
  raw: "By placing 1 [Kurata's Army] trait card from your hand face down under this Tamer",
} satisfies Action["cost"];

const trashFaceDown = {
  kind: "trashBottomFaceDownUnderTamer",
  controller: "mine",
  count: 2,
  raw: "By trashing 2 bottom face-down cards from under any of your Tamers",
} satisfies Action["cost"];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: placeKurataFaceDown,
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
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: trashFaceDown,
          optional: true,
          abortOnDecline: true,
          actions: [
            {
              effectTextPart:
                "this Tamer may digivolve into a [Kurata's Army] trait Digimon card in the hand or trash with the cost reduced by 2.",
              kind: "Digivolve",
              target: self,
              into: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: kurataArmy,
              },
              from: ["hand", "trash"],
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
      trigger: "EndOfAttack",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SelectBind",
          effectTextPart: "By choosing 1 of your Digimon",
          target: {
            filter: { controller: "mine", kind: ["Digimon"] },
            count: 1,
            bindAs: "chosenDigimon",
          },
          optional: true,
          abortOnDecline: true,
        },
        {
          kind: "Delete",
          effectTextPart: "delete it and 1 of your opponent's Digimon with as much DP as this Digimon or less.",
          target: { filter: {}, fromSelectionRef: "chosenDigimon", count: 1 },
          additionalSimultaneousTargets: [
            {
              filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", relativeToSource: true } },
              count: 1,
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

registerIrCard("BT27-092", compiled);
