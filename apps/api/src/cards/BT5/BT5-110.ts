import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] You may return 1 of your Digimon with [Omnimon] in its name to its owner's hand to delete all Digimon and Tamers. Trash all of the digivolution cards of the Digimon you returned with this effect.",
          kind: "SelectBind",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Omnimon"],
                  match: "name",
                },
              ],
            },
            count: 1,
            bindAs: "omnimonSelected",
          },
          optional: true,
          abortOnDecline: true,
        },
        {
          effectTextPart:
            "[Main] You may return 1 of your Digimon with [Omnimon] in its name to its owner's hand to delete all Digimon and Tamers. Trash all of the digivolution cards of the Digimon you returned with this effect.",
          kind: "Return",
          target: {
            fromSelectionRef: "omnimonSelected",
            filter: {},
            count: 1,
          },
          to: "hand",
        },
        {
          effectTextPart:
            "[Main] You may return 1 of your Digimon with [Omnimon] in its name to its owner's hand to delete all Digimon and Tamers. Trash all of the digivolution cards of the Digimon you returned with this effect.",
          kind: "Delete",
          target: {
            filter: {
              controllerDefault: "any",
              kind: ["Digimon", "Tamer"],
            },
            count: "all",
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT5-110", compiled);
