import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOneOfYoursDigivolves",
          sourceFilter: {
            controllerDefault: "mine",
            nameOrTrait: [
              {
                tokens: ["Leviamon (X Antibody)"],
                match: "name",
              },
            ],
          },
          actions: [
            {
              kind: "CostGatedBlock",
              optional: true,
              cost: {
                kind: "return",
                target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
                raw: "by returning this card to the bottom of the deck",
              },
              actions: [
                {
                  kind: "Delete",
                  target: { count: 1, filter: { controller: "opponent", kind: ["Digimon"], levels: [4] } },
                  additionalSimultaneousTargets: [
                    { count: 1, filter: { controller: "opponent", kind: ["Digimon"], levels: [6] } },
                  ],
                },
              ],
            },
          ],
        },
      ],
      isFromTrash: true,
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By trashing 1 card in your hand, delete 1 of your opponent's level 4 and 1 of their level 6 Digimon.",
          kind: "CostGatedBlock",
          optional: true,
          cost: {
            kind: "trash",
            target: { filter: { zone: "hand", controller: "mine" }, count: 1 },
            raw: "By trashing 1 card in your hand",
          },
          actions: [
            {
              kind: "Delete",
              target: { count: 1, filter: { controller: "opponent", kind: ["Digimon"], levels: [4] } },
              additionalSimultaneousTargets: [
                { count: 1, filter: { controller: "opponent", kind: ["Digimon"], levels: [6] } },
              ],
            },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ActivateMain",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT15-100", compiled);
export { compiled };
