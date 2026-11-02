import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          effectTextPart:
            "[On Play] [When Attacking] [Once Per Turn] 1 Digimon may gain ＜Security Attack -1＞until the end of your opponent's turn.",
          kind: "GainKeyword",
          target: {
            filter: {
              controller: "any",
              kind: ["Digimon"],
            },
            count: 1,
          },
          keyword: {
            keyword: "SecurityAttack",
            amount: -1,
            raw: "＜Security Attack -1＞",
          },
          duration: "untilOpponentTurnEnd",
          optional: true,
        },
        {
          kind: "RevealAdd",
          revealCount: 4,
          add: [
            {
              effectTextPart: "Add 1 of each [Gokuumon]",
              filter: {
                nameOrTrait: [{ tokens: ["Gokuumon"], match: "nameExact" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "[Sagomon]",
              filter: {
                nameOrTrait: [{ tokens: ["Sagomon"], match: "nameExact" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "[Cho-Hakkaimon]",
              filter: {
                nameOrTrait: [{ tokens: ["Cho-Hakkaimon"], match: "nameExact" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "[Shakamon] among them to the hand.",
              filter: {
                nameOrTrait: [{ tokens: ["Shakamon"], match: "nameExact" }],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
          condition: {
            kind: "digiXrosCount",
            minimum: 1,
            raw: "DigiXrosing",
          },
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          effectTextPart:
            "[On Play] [When Attacking] [Once Per Turn] 1 Digimon may gain ＜Security Attack -1＞until the end of your opponent's turn.",
          kind: "GainKeyword",
          target: {
            filter: {
              controller: "any",
              kind: ["Digimon"],
            },
            count: 1,
          },
          keyword: {
            keyword: "SecurityAttack",
            amount: -1,
            raw: "＜Security Attack -1＞",
          },
          duration: "untilOpponentTurnEnd",
          optional: true,
        },
        {
          kind: "RevealAdd",
          revealCount: 4,
          add: [
            {
              effectTextPart: "Add 1 of each [Gokuumon]",
              filter: {
                nameOrTrait: [{ tokens: ["Gokuumon"], match: "nameExact" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "[Sagomon]",
              filter: {
                nameOrTrait: [{ tokens: ["Sagomon"], match: "nameExact" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "[Cho-Hakkaimon]",
              filter: {
                nameOrTrait: [{ tokens: ["Cho-Hakkaimon"], match: "nameExact" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "[Shakamon] among them to the hand.",
              filter: {
                nameOrTrait: [{ tokens: ["Shakamon"], match: "nameExact" }],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
          condition: {
            kind: "digiXrosCount",
            minimum: 1,
            raw: "DigiXrosing",
          },
        },
      ],
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          sourceFilter: {
            isSelfRef: true,
          },
          actions: [
            {
              kind: "Return",
              target: {
                filter: {
                  zone: "digivolutionCards",
                  hostFilter: {
                    isSelfRef: true,
                  },
                  controllerDefault: "mine",
                  kind: ["Digimon"],
                  colors: ["Yellow"],
                },
                count: 1,
              },
              to: "hand",
            },
          ],
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "GainKeyword",
          target: {
            filter: {
              controller: "any",
              kind: ["Digimon"],
            },
            count: 1,
          },
          keyword: {
            keyword: "SecurityAttack",
            amount: -1,
            raw: "＜Security Attack -1＞",
          },
          duration: "untilOpponentTurnEnd",
          optional: true,
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digiXrosRequirement: [
    {
      materials: [
        {
          names: ["Gokuumon", "Sagomon", "Cho-Hakkaimon"],
        },
      ],
      count: 2,
      maxMaterials: 1,
    },
  ],
};

registerIrCard("EX6-025", compiled);
