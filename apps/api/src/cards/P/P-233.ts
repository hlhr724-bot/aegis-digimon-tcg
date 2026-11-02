import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      effectKey: "P-233/on-play",
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 [Game] trait card",
              filter: { nameOrTrait: [{ tokens: ["Game"], match: "trait" }] },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 [Invincible], [Life] or [Entertainment] trait card among them to the hand.",
              filter: { nameOrTrait: [{ tokens: ["Invincible", "Life", "Entertainment"], match: "trait" }] },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      effectKey: "P-233/linked-trigger",
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenLinked",
          sourceFilter: { controller: "mine", kind: ["Digimon"] },
          linkedCardFilter: {
            nameOrTrait: [{ tokens: ["Game", "Life", "Entertainment"], match: "trait" }],
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
      effectKey: "P-233/security",
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

registerIrCard("P-233", compiled);
