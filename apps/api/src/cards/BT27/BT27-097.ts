import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const storeText =
  "[All Turns] When a Digimon attacks, by suspending this Tamer, you may place the top 2 cards of your deck face down under this Tamer.";
const useText =
  "After, if it's your turn, by trashing 4 bottom face-down cards from under any of your Tamers, you may use 1 purple [BEATBREAK] trait Option card from your trash with the cost reduced by 3.";

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
              condition: { kind: "isYourTurn" },
              optional: true,
              cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 4 },
              actions: [
                {
                  kind: "UseOptionWithoutCost",
                  filter: {
                    controller: "mine",
                    kind: ["Option"],
                    colors: ["Purple"],
                    nameOrTrait: [{ tokens: ["BEATBREAK"], match: "trait" }],
                  },
                  from: ["trash"],
                  payCost: true,
                  reduceCostBy: 3,
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

registerIrCard("BT27-097", compiled);
