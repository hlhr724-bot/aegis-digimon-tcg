import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart:
            "[When Digivolving] If DNA digivolving, your opponent chooses 1 of their Digimon. Delete all of their other Digimon.",
          kind: "Delete",
          target: {
            filter: { controllerDefault: "opponent", kind: ["Digimon"] },
            count: "all",
            except: {
              filter: { controllerDefault: "opponent", kind: ["Digimon"] },
              count: 1,
              chooser: "opponent",
            },
          },
          condition: {
            kind: "isDnaDigivolving",
            raw: "DNA digivolving",
          },
        },
        {
          kind: "GainKeyword",
          target: {
            filter: { isSelfRef: true },
            count: 1,
            isSelf: true,
          },
          keyword: { keyword: "Blitz", raw: "＜Blitz＞" },
          duration: "forTheTurn",
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          effectTextPart: "[When Attacking][Once Per Turn] This Digimon gets +2000 DP for the turn.",
          kind: "ModifyDP",
          target: {
            filter: { isSelfRef: true },
            count: 1,
            isSelf: true,
          },
          amount: 2000,
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "Then, this Digimon may digivolve into [Imperialdramon: Fighter Mode] in your hand for the digivolution cost.",
          kind: "Digivolve",
          target: {
            filter: { isSelfRef: true },
            count: 1,
            isSelf: true,
          },
          into: {
            controllerDefault: "mine",
            nameOrTrait: [{ tokens: ["Imperialdramon: Fighter Mode"], match: "nameExact" }],
          },
          from: ["hand"],
          payCost: true,
          ignoreReqs: true,
          useAlternateCost: true,
          costOverride: 2,
          optional: true,
        },
      ],
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  dnaDigivolveRequirement: [
    {
      cost: 0,
      materials: [
        { color: "Purple", level: 5 },
        { color: "Red", level: 5 },
      ],
    },
  ],
};

registerIrCard("EX3-063", compiled);
