import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "Digivolve",
          target: {
            filter: {
              controller: "mine",
              kind: ["Tamer"],
              colors: ["Yellow"],
            },
            count: 1,
          },
          onto: {
            filter: {
              controller: "mine",
              kind: ["Tamer"],
              colors: ["Yellow"],
            },
            count: 1,
          },
          asLevel: 3,
          from: ["hand"],
          payCost: true,
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Digivolve",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          into: {
            controllerDefault: "mine",
            nameOrTrait: [
              {
                tokens: ["AncientGarurumon"],
                match: "nameExact",
              },
            ],
          },
          payCost: true,
          from: ["hand"],
          costOverride: 3,
          ignoreRequirements: true,
          optional: true,
          condition: {
            kind: "anyOf",
            conditions: [
              {
                kind: "selfDigivolutionStackHasTrait",
                filter: {
                  nameOrTrait: [
                    {
                      tokens: ["KendoGarurumon"],
                      match: "name",
                    },
                  ],
                },
                raw: "[KendoGarurumon] is in this Digimon's digivolution cards",
              },
              {
                kind: "youHave",
                filter: {
                  controllerDefault: "mine",
                  kind: ["Digimon", "Tamer"],
                  colors: ["Black", "Purple"],
                },
                raw: "you have a black or purple Digimon or Tamer",
              },
            ],
            raw: "[KendoGarurumon] is in this Digimon's digivolution cards or you have a black or purple Digimon or Tamer",
          },
        },
        {
          kind: "DelayedDelete",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          condition: {
            kind: "ifThisEffectDigivolved",
            raw: "digivolved by this effect",
          },
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Draw",
          controller: "mine",
          amount: 1,
          condition: {
            kind: "zoneCount",
            seat: "mine",
            zone: "hand",
            op: "lte",
            value: 7,
            raw: "you have 7 or fewer cards in your hand",
          },
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      namesExact: ["Koji Minamoto"],
      cost: 2,
      isAlternate: true,
      baseIsTamer: true,
    },
    {
      namesExact: ["KendoGarurumon"],
      cost: 1,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT17-022", compiled);
export { compiled };
