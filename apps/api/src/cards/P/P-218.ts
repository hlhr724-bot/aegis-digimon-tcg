import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      effectKey: "P-218/on-play",
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 [Entertainment] trait card",
              filter: { nameOrTrait: [{ tokens: ["Entertainment"], match: "trait" }] },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 [Awakening], [Tool] or [Navi] trait card among them to the hand.",
              filter: { nameOrTrait: [{ tokens: ["Awakening", "Tool", "Navi"], match: "trait" }] },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      effectKey: "P-218/linked-trigger",
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenLinked",
          sourceFilter: { controller: "mine", kind: ["Digimon"] },
          linkedCardFilter: {
            nameOrTrait: [{ tokens: ["Entertainment", "Tool", "Navi"], match: "trait" }],
          },
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
      effectKey: "P-218/security",
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

registerIrCard("P-218", compiled);
