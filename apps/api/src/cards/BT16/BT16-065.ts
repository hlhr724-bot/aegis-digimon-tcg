import type { Action, CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const bossFilter: Filter = {
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Boss"], match: "trait" }],
};

const revealDelete: Action = {
  kind: "RevealChooseDeleteBudget",
  revealCount: 3,
  revealController: "mine",
  chooseFilter: { kind: ["Digimon"] },
  deleteFilter: { controller: "opponent", kind: ["Digimon"] },
  deleteCount: 1,
  returnRevealed: "trash",
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "BeforePayCost",
      actions: [
        {
          kind: "ReducePlayCost",
          payment: {
            kind: "automatic",
            condition: {
              kind: "anyOf",
              conditions: [
                { kind: "youHave", filter: bossFilter },
                { kind: "opponentHas", filter: bossFilter },
              ],
            },
          },
          amount: { kind: "fixed", value: 6 },
        },
        {
          kind: "ReducePlayCost",
          payment: {
            kind: "returnFromTrashToDeckTop",
            target: {
              filter: {
                controller: "mine",
                zone: "trash",
                nameOrTrait: [{ tokens: ["D-Brigade"], match: "trait" }],
              },
              count: 6,
            },
          },
          amount: { kind: "fixed", value: 6 },
        },
      ],
    },
    { trigger: "OnPlay", actions: [revealDelete] },
    { trigger: "WhenDigivolving", actions: [revealDelete] },
    {
      trigger: "EndOfYourTurn",
      actions: [
        {
          kind: "DnaDigivolve",
          materials: { filter: { controller: "mine", kind: ["Digimon"] }, count: 2 },
          into: {
            controllerDefault: "mine",
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["Chaosmon"], match: "nameExact" }],
          },
          payCost: true,
          optional: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT16-065", compiled);
