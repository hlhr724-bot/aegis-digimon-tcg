import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "CostGatedBlock",
          optional: true,
          abortOnDecline: true,
          cost: {
            kind: "trash",
            target: {
              filter: { zone: "hand", controller: "mine" },
              count: 1,
            },
            raw: "By trashing 1 card in your hand",
          },
          actions: [
            {
              kind: "SecurityManipulation",
              op: "trashTop",
              controller: "opponent",
              amount: 1,
              optionalFor: "opponent",
              bindResultAs: "opponentTrashedSecurity",
            },
            {
              kind: "Recover",
              amount: 1,
              optional: false,
              condition: {
                kind: "lastEffectDidNotAct",
                raw: "opponent didn't trash security",
              },
            },
          ],
        },
      ],
    },
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "CostGatedBlock",
          optional: true,
          abortOnDecline: true,
          cost: {
            kind: "trash",
            target: {
              filter: { zone: "hand", controller: "mine" },
              count: 1,
            },
            raw: "By trashing 1 card in your hand",
          },
          actions: [
            {
              kind: "SecurityManipulation",
              op: "trashTop",
              controller: "opponent",
              amount: 1,
              optionalFor: "opponent",
              bindResultAs: "opponentTrashedSecurity",
            },
            {
              kind: "Recover",
              amount: 1,
              optional: false,
              condition: {
                kind: "lastEffectDidNotAct",
                raw: "opponent didn't trash security",
              },
            },
          ],
        },
      ],
    },
    {
      trigger: "EndOfYourTurn",
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
                tokens: ["Lucemon: Chaos Mode"],
                match: "nameExact",
              },
            ],
            excludeCardIds: ["BT7-111"],
          },
          payCost: false,
          from: ["trash"],
          optional: true,
          cost: {
            kind: "placeAsSecurity",
            optional: true,
            target: {
              filter: {
                controller: "mine",
                kind: ["Digimon"],
                levels: [6],
                zone: "battleArea",
              },
              count: 1,
            },
            raw: "By placing 1 of your level 6 Digimon on top of your security stack",
            destination: "security",
            position: "top",
          },
          abortOnDecline: true,
          ignoreRequirements: false,
        },
      ],
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      names: ["Cupimon"],
      cost: 5,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT18-034", compiled);
