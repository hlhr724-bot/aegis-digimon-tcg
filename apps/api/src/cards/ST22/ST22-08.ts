import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          condition: { kind: "youHave", filter: { controllerDefault: "mine", kind: ["Tamer"] } },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestDP" }, count: 1 },
        },
        { kind: "AddToHandSelf" },
      ],
      isSecurity: true,
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] You may link this card to 1 of your Digimon without paying the cost.",
          kind: "Link",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          recipient: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          payCost: false,
          optional: true,
        },
        {
          effectTextPart: "Then, delete 1 of your opponent's Digimon with as much or less DP as 1 of your Digimon.",
          kind: "SelectBind",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1, bindAs: "digimonDpReference" },
        },
        {
          effectTextPart: "Then, delete 1 of your opponent's Digimon with as much or less DP as 1 of your Digimon.",
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              relativeTo: { attr: "dp", op: "lte", selectionRef: "digimonDpReference" },
            },
            count: 1,
          },
        },
      ],
    },
    {
      trigger: "EndOfYourTurn",
      isLinked: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Attack",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          attackTargetScope: "any",
          drainTimingWindowDuringAttack: true,
          optional: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST22-08", compiled);
