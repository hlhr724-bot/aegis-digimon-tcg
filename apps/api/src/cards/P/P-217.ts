import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const linkedTraits = [{ tokens: ["Social", "Creation", "Navi", "Tool"], match: "trait" as const }];

const compiled: CompiledCard = {
  effects: [
    {
      effectKey: "P-217/on-play",
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 [Social] trait card",
              filter: { nameOrTrait: [{ tokens: ["Social"], match: "trait" }] },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 [Creation], [Navi] or [Tool] trait card among them to the hand.",
              filter: { nameOrTrait: [{ tokens: ["Creation", "Navi", "Tool"], match: "trait" }] },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      effectKey: "P-217/linked-trigger",
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenLinked",
          sourceFilter: { controller: "mine", kind: ["Digimon"] },
          linkedCardFilter: { nameOrTrait: linkedTraits },
          actions: [
            {
              kind: "GainMemory",
              amount: 1,
              cost: {
                kind: "suspend",
                target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
                raw: "by suspending this Tamer",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
    },
    {
      effectKey: "P-217/security",
      trigger: "Security",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          payCost: false,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("P-217", compiled);
