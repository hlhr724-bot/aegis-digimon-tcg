import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "YourTurn",
      isFromTrash: true,
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOneOfYoursDigivolves",
          sourceFilter: {
            controllerDefault: "mine",
            nameOrTrait: [{ tokens: ["Lilithmon (X Antibody)"], match: "nameExact" }],
          },
          actions: [
            {
              kind: "ActivateMain",
              optional: true,
              abortOnDecline: true,
              cost: {
                kind: "return",
                target: { filter: { zone: "trash", isSelfRef: true }, count: 1 },
                to: "deckBottom",
                raw: "by returning this card to the bottom of the deck",
              },
            },
          ],
          raw: "When your Digimon digivolves into Lilithmon (X Antibody), return this card to the bottom of the deck to activate its Main effect",
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            '[Main] All your opponent\'s Digimon gain "[End of Your Turn] Delete 1 of your Digimon." until end of their turn.',
          kind: "GainTriggeredEffect",
          includeLaterEntrants: true,
          once: true,
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" },
          gainedTrigger: "EndOfYourTurn",
          gainedActions: [
            {
              kind: "Delete",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            },
          ],
          duration: "untilOpponentTurnEnd",
          raw: "[End of Your Turn] Delete 1 of your Digimon.",
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [
        {
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], unsuspended: true }, count: 1 },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX7-072", compiled);
