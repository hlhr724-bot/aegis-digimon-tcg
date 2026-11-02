import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 4,
          add: [
            {
              effectTextPart: "Add 1 Digimon card with [Three Musketeers] in its traits",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Three Musketeers", "ThreeMusketeers"], match: "trait" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 Option card with a memory cost of 7 among them to your hand.",
              filter: {
                controllerDefault: "mine",
                kind: ["Option"],
                playCostOneOf: [7],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "trash",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  baseGrantedDigivolve: [
    {
      target: { traits: ["Three Musketeers"] },
      cost: 6,
      ignoreRequirements: true,
      sourceZones: ["hand"],
    },
  ],
};

registerIrCard("BT6-060", compiled);
