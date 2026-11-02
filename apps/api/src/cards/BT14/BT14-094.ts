import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const MAIN_LABELS = [
  "1 of your opponent's Digimon gets -6000 DP for the turn",
  "Delete 1 of your [Angemon]: place 1 of your opponent's Digimon at the bottom of their security",
];

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Activate 1 of the effects below:",
          kind: "Modal",
          choose: 1,
          labels: MAIN_LABELS,
          options: [
            [
              {
                effectTextPart: "1 of your opponent's Digimon gets -6000 DP for the turn.",
                kind: "ModifyDP",
                target: {
                  filter: {
                    controller: "opponent",
                    kind: ["Digimon"],
                  },
                  count: 1,
                },
                amount: -6000,
                duration: "forTheTurn",
              },
            ],
            [
              {
                effectTextPart:
                  "By deleting 1 of your [Angemon], place 1 of your opponent's Digimon at the bottom of their security stack.",
                kind: "SecurityManipulation",
                op: "placeAsSecurity",
                controller: "opponent",
                source: {
                  filter: {
                    controller: "opponent",
                    kind: ["Digimon"],
                  },
                  count: 1,
                },
                toTop: false,
                cost: {
                  kind: "deleteOwn",
                  target: {
                    filter: {
                      controller: "mine",
                      nameOrTrait: [
                        {
                          tokens: ["Angemon"],
                          match: "name",
                        },
                      ],
                    },
                    count: 1,
                  },
                  raw: "By deleting 1 of your [Angemon]",
                },
              },
            ],
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

registerIrCard("BT14-094", compiled);
export { compiled };
