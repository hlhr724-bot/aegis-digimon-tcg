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
            filter: {
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Tamer"],
              nameOrTrait: [{ tokens: ["Hunter"], match: "trait" }],
            },
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "Digivolve 1 of your Digimon into a Digimon card with ＜Save＞ in its text under one of your Tamers for its digivolution cost.",
          kind: "Digivolve",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          into: {
            controller: "mine",
            kind: ["Digimon"],
            zone: "underTamers",
            nameOrTrait: [{ tokens: ["Save"], match: "text" }],
          },
          from: ["underTamers"],
          payCost: true,
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "AddToHandSelf" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

export default registerIrCard("BT12-109", compiled);
