import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
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
            kind: "youHave",
            filter: {
              zone: "battleArea",
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Beelzemon"],
                  match: "name",
                },
              ],
            },
            raw: "you have a Digimon with [Beelzemon] in its name in play",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Unsuspend 1 of your Digimon with [Leomon] or [Beelzemon] in its name.",
          kind: "Unsuspend",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Leomon", "Beelzemon"],
                  match: "name",
                },
              ],
            },
            count: 1,
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

registerIrCard("EX2-069", compiled);
