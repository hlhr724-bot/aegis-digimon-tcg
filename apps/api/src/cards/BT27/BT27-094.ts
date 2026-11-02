import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const storeText =
  "[All Turns] When a Digimon attacks, by suspending this Tamer, you may place the top 2 cards of your deck face down under this Tamer.";
const useText =
  "After, if it's your opponent's turn, by trashing 4 bottom face-down cards from under any of your Tamers, you may use 1 black [BEATBREAK] trait Option card from your hand without paying the cost.";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourTurn",
      actions: [{ kind: "SetMemory", value: 3, condition: { kind: "memoryAtMost", value: 2, controller: "mine" } }],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenAttacking",
          effectTextPart: storeText,
          optional: true,
          cost: { kind: "suspend", target: self },
          actions: [
            {
              kind: "PlaceUnder",
              target: { filter: {}, count: 2 },
              fromDeckTop: true,
              position: "bottom",
              faceDown: true,
              effectTextPart: storeText,
            },
            {
              kind: "CostGatedBlock",
              effectTextPart: useText,
              condition: { kind: "isOpponentsTurn" },
              optional: true,
              cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 4 },
              actions: [
                {
                  kind: "UseOptionWithoutCost",
                  filter: {
                    controller: "mine",
                    kind: ["Option"],
                    colors: ["Black"],
                    nameOrTrait: [{ tokens: ["BEATBREAK"], match: "trait" }],
                  },
                  from: ["hand"],
                  payCost: false,
                },
              ],
            },
          ],
        },
      ],
    },
    { trigger: "Security", isSecurity: true, actions: [{ kind: "PlayWithoutCost", target: self, payCost: false }] },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-094", compiled);
