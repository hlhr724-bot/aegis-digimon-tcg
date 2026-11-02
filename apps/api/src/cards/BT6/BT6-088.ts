import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenMovedFromBreeding",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
            nameOrTrait: [
              {
                tokens: ["Gabumon", "Garurumon"],
                match: "name",
              },
            ],
          },
          actions: [
            {
              kind: "GainMemory",
              amount: 1,
            },
            {
              kind: "Draw",
              controller: "mine",
              amount: 1,
            },
          ],
        },
      ],
    },
    {
      effectKey: "BT6-088/main-digivolve-bond-of-friendship",
      trigger: "YourTurn",
      condition: {
        kind: "youHave",
        filter: {
          controller: "mine",
          kind: ["Digimon"],
          colors: ["Blue"],
          nameOrTrait: [{ tokens: ["Gabumon"], match: "nameExact" }],
        },
      },
      actions: [
        {
          effectTextPart:
            "[Main][Once Per Turn] Digivolve your [Gabumon] into 1 [Gabumon - Bond of Friendship] in your hand for its digivolution cost, ignoring its level. If you do, trash the top 2 cards of your security stack.",
          kind: "Digivolve",
          target: {
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              colors: ["Blue"],
              nameOrTrait: [
                {
                  tokens: ["Gabumon"],
                  match: "nameExact",
                },
              ],
            },
            count: 1,
            upTo: true,
            bindAs: "bondHost",
          },
          into: {
            controllerDefault: "mine",
            kind: ["Digimon"],
            nameOrTrait: [
              {
                tokens: ["Gabumon - Bond of Friendship"],
                match: "nameExact",
              },
            ],
          },
          payCost: true,
          from: ["hand"],
          costOverride: 3,
          ignoreRequirements: true,
          optional: false,
        },
        {
          kind: "SecurityManipulation",
          op: "trashTop",
          controller: "mine",
          amount: 2,
          condition: {
            kind: "ifThisEffectDigivolved",
          },
        },
        {
          effectTextPart: "Then, if you have 1 or more security cards, delete that Digimon at the end of the turn.",
          kind: "SubTrigger",
          event: "endOfTurn",
          printedClause: "[Pending] At the end of the turn, delete that Digimon.",
          once: true,
          playerScoped: true,
          duration: "untilYourTurnEnd",
          condition: {
            kind: "securityAtLeast",
            value: 1,
          },
          actions: [
            {
              kind: "Delete",
              target: {
                filter: {},
                count: 1,
                fromSelectionRef: "bondHost",
              },
            },
          ],
        },
      ],
      frequency: "OncePerTurn",
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          from: ["security"],
          payCost: false,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT6-088", compiled);
