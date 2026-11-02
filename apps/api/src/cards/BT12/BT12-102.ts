import type { CompiledCard, Filter, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const movedBlue: Target = {
  filter: { controller: "mine", kind: ["Digimon"], colors: ["Blue"] },
  count: 1,
  bindAs: "bt12_102_moved",
};
const anotherBlue: Filter = {
  controller: "mine",
  kind: ["Digimon"],
  colors: ["Blue"],
  excludeSelectionRef: "bt12_102_moved",
};

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "BeforePayCost",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          sourceFilter: { isSelfRef: true },
          mode: "reduceCost",
          amount: 3,
          cost: {
            kind: "place",
            target: movedBlue,
            destination: "digivolutionStack",
            position: "bottom",
            host: "target",
            underFilter: anotherBlue,
            targetIsPermanent: true,
            shedOwnCards: true,
            raw: "by placing 1 of your blue Digimon under another blue Digimon",
          },
          optional: true,
          abortOnDecline: true,
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Return 1 of your opponent's Digimon to their owner's deck.",
          kind: "Return",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          to: "deckBottom",
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

export default registerIrCard("BT12-102", compiled);
