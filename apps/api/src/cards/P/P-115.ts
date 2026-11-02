import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";
const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnDeletion",
      actions: [
        {
          effectTextPart:
            "[On Deletion] You may play 1 Tamer card with [Nene Amano]/[Yuu Amano] in its name from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              kind: ["Tamer"],
              nameOrTrait: [
                {
                  tokens: ["Nene Amano", "Yuu Amano"],
                  match: "name",
                },
              ],
            },
            count: 1,
          },
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
        },
        {
          effectTextPart: "Then, ＜Save＞.",
          kind: "PlaceUnder",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          underFilter: {
            controller: "mine",
            kind: ["Tamer"],
            excludeToken: true,
          },
          optional: true,
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "Aura",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          effect: {
            kind: "keyword",
            keyword: {
              keyword: "SecurityAttack",
              amount: 1,
              raw: "＜Security Attack +1＞",
            },
          },
          while: {
            kind: "allOf",
            conditions: [
              { kind: "selfLevelAtLeast", value: 5 },
              {
                kind: "anyOf",
                conditions: [
                  { kind: "selfHasTrait", filter: { nameOrTrait: [{ tokens: ["Bagra Army"], match: "trait" }] } },
                  { kind: "selfHasTrait", filter: { nameOrTrait: [{ tokens: ["Twilight"], match: "trait" }] } },
                ],
              },
            ],
            raw: "this Digimon has the [Bagra Army] or [Twilight] trait and is level 5 or higher",
          },
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("P-115", compiled);
