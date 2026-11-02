import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          condition: {
            kind: "anyOf",
            conditions: [
              {
                kind: "youHave",
                filter: {
                  zone: "battleArea",
                  controllerDefault: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Pulsemon"], match: "name" }],
                },
              },
              {
                kind: "youHave",
                filter: {
                  zone: "battleArea",
                  controllerDefault: "mine",
                  kind: ["Digimon"],
                  digivolutionStackNameOrTrait: [{ tokens: ["Pulsemon"], match: "nameExact" }],
                },
              },
            ],
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] If you have 3 or more security cards, 1 of your opponent's Digimon gets -12000 DP for the turn.",
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -12000,
          duration: "forTheTurn",
          condition: {
            kind: "securityAtLeast",
            value: 3,
          },
        },
        {
          effectTextPart:
            "If you have 3 or fewer security cards, place 1 of your opponent's Digimon face down on top of their security stack.",
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
          toTop: true,
          condition: {
            kind: "zoneCount",
            seat: "mine",
            zone: "security",
            op: "lte",
            value: 3,
            raw: "you have 3 or fewer security cards",
          },
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

registerIrCard("BT10-101", compiled);
