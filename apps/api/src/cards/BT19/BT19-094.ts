import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "YourTurn",
      optional: true,
      actions: [
        {
          kind: "SubTrigger",
          optional: true,
          event: "whenOneOfYoursDigivolves",
          sourceFilter: {
            controllerDefault: "mine",
            nameOrTrait: [{ tokens: ["Lucemon (X Antibody)"], match: "nameExact" }],
          },
          actions: [
            {
              kind: "SecurityManipulation",
              op: "trashTop",
              controller: "opponent",
              optionalFor: "opponent",
              amount: 1,
              bindResultAs: "opponentSecurityTrashedBySeventh",
              cost: {
                kind: "return",
                target: { filter: { zone: "trash", controller: "mine", isSelfRef: true }, count: 1, isSelf: true },
                raw: "by returning this card from the trash to the bottom of the deck",
              },
            },
            {
              kind: "SecurityManipulation",
              op: "addTop",
              controller: "mine",
              source: "deck",
              amount: 1,
              condition: { kind: "bindingEmpty", ref: "opponentSecurityTrashedBySeventh" },
            },
          ],
          raw: "whenOneOfYoursDigivolves",
        },
      ],
      isFromTrash: true,
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Delete your opponent's Digimon until they have as many as the number of your security cards.",
          kind: "DeleteUntilCount",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" },
          untilCountSource: "mineSecurityCount",
        },
        {
          effectTextPart: "If this effect deleted, ＜Recovery +1 (Deck)＞.",
          kind: "SecurityManipulation",
          op: "addTop",
          controller: "mine",
          source: "deck",
          amount: 1,
          condition: { kind: "ifThisEffectActed" },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: { filter: { controller: "mine", nameOrTrait: [{ tokens: ["Lucemon"], match: "nameExact" }] }, count: 1 },
          from: ["trash"],
          payCost: false,
          optional: true,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT19-094", compiled);
