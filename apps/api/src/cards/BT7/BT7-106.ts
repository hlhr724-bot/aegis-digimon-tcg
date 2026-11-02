import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

type ModalAction = Extract<CompiledCard["effects"][number]["actions"][number], { kind: "Modal" }>;

const loadedCondition: NonNullable<ModalAction["optionConditions"]>[number] = {
  kind: "youHave",
  filter: {
    controllerDefault: "mine",
    kind: ["Digimon"],
    digivolutionCardsAtLeast: 5,
    nameOrTrait: [{ tokens: ["X-Antibody"], match: "trait" }],
  },
  raw: "you have a Digimon with 5 or more digivolution cards and [X Antibody] in its traits",
};

const effect: ModalAction = {
  effectTextPart:
    "[Main] Delete 1 of your opponent's Digimon with a play cost of 6 or less. If you have a Digimon with 5 or more digivolution cards and [X-Antibody] in its traits in play, you may delete 1 of your opponent's Digimon without [X-Antibody] in its traits instead.",
  kind: "Modal",
  choose: 1,
  labels: ["Delete a Digimon with play cost 6 or less", "Instead, delete a Digimon without [X Antibody] in its traits"],
  optionConditions: [null, loadedCondition],
  options: [
    [
      {
        kind: "Delete",
        target: { filter: { controller: "opponent", kind: ["Digimon"], playCostLte: 6 }, count: 1 },
      },
    ],
    [
      {
        kind: "Delete",
        target: {
          filter: {
            controller: "opponent",
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["X-Antibody"], match: "trait", negate: true }],
          },
          count: 1,
        },
      },
    ],
  ],
};

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Main", actions: [effect] },
    { trigger: "Security", isSecurity: true, actions: [effect] },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT7-106", compiled);
