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
          condition: {
            kind: "youHave",
            filter: { zone: "battleArea", controllerDefault: "mine", kind: ["Digimon", "Tamer"], colors: ["Green"] },
            raw: "you have a green Digimon or Tamer in play",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "For each color your Digimon have, activate it again.",
          kind: "RepeatPerCount",
          countSource: "distinctOwnDigimonColors",
          countScaling: { per: 1, filter: { controller: "mine", kind: ["Digimon"] }, unit: "colors" },
          action: {
            effectTextPart: "1 of your opponent's Digimon gets -6000 DP for the turn.",
            kind: "ModifyDP",
            target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
            amount: -6000,
            duration: "forTheTurn",
          },
        },
        {
          effectTextPart: "1 of your opponent's Digimon gets -6000 DP for the turn.",
          kind: "ModifyDP",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: -6000,
          duration: "forTheTurn",
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "ModifyDP",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: -12000,
          duration: "forTheTurn",
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX4-068", compiled);
