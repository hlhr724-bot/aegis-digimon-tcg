import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 4,
          add: [
            {
              effectTextPart: "Add 1 card with [Xros Heart] in its traits among them to your hand",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [{ tokens: ["Xros Heart"], match: "trait" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "place 1 Digimon card with [Xros Heart] in its traits among them under this Tamer.",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Xros Heart"], match: "trait" }],
              },
              count: 1,
              to: "underTamer",
              underFilter: { isSelfRef: true },
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
            hasDigiXrosRequirements: true,
          },
          actions: [
            {
              kind: "PlaceUnder",
              target: { filter: { controller: "mine", zone: "underTamer" }, count: "all" },
              underTamerHostScope: "any",
              underFilter: { isTriggerSource: true },
              asDigiXrosMaterial: true,
              cost: {
                kind: "suspend",
                target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
                raw: "by suspending this Tamer",
              },
              optional: true,
            },
          ],
        },
      ],
    },
    {
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

registerIrCard("BT10-087", compiled);
