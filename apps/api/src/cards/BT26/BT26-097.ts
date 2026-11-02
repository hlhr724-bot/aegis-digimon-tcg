import type { CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const aegiomon: Filter = {
  controller: "mine",
  zone: "battleArea",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Aegiomon"], match: "nameExact" }],
};
const yukiTamer: Filter = {
  controller: "mine",
  zone: "battleArea",
  kind: ["Tamer"],
  nameOrTrait: [{ tokens: ["Dan Yuki"], match: "name" }],
};
const jupitermon: Filter = {
  controller: "mine",
  zone: "battleArea",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Jupitermon"], match: "nameExact" }],
};
const aegiocHusmon: Filter = {
  controller: "mine",
  zone: "trash",
  nameOrTrait: [{ tokens: ["Aegiochusmon"], match: "name" }],
};
const tsSecurity: Filter = {
  controller: "mine",
  zone: "hand",
  kind: ["Digimon", "Tamer"],
  nameOrTrait: [{ tokens: ["TS"], match: "trait" }],
  playCostLte: 5,
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "CostModifier",
          costType: "use",
          mode: "delta",
          amount: 1,
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          handResident: true,
          duration: "permanent",
          scaling: { per: 1, unit: "security", filter: { controller: "mine" } },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By placing 1 of your Tamers with [Dan Yuki] or [Kanan Yuki] in their names as any of your [Aegiomon]'s bottom digivolution card, it may digivolve into [Jupitermon] in the hand or trash, ignoring digivolution requirements and without paying the cost. After, you may place 1 card with [Aegiochusmon] in its name in your trash as any of your [Jupitermon]'s top digivolution card.",
          kind: "CostGatedBlock",
          cost: {
            kind: "place",
            targetIsPermanent: true,
            target: {
              filter: yukiTamer,
              orFilters: [
                {
                  controller: "mine",
                  zone: "battleArea",
                  kind: ["Tamer"],
                  nameOrTrait: [{ tokens: ["Kanan Yuki"], match: "name" }],
                },
              ],
              count: 1,
            },
            destination: "digivolutionStack",
            host: { filter: aegiomon, count: 1 },
            bindHostAs: "aegiomonHost",
            position: "bottom",
          },
          optional: true,
          abortOnDecline: true,
          actions: [
            {
              kind: "Digivolve",
              target: { filter: aegiomon, count: 1, fromSelectionRef: "aegiomonHost" },
              into: {
                filter: {
                  controller: "mine",
                  zone: ["hand", "trash"],
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Jupitermon"], match: "nameExact" }],
                },
                count: 1,
              },
              from: ["hand", "trash"],
              payCost: false,
              ignoreRequirements: true,
              optional: true,
            },
            {
              kind: "PlaceUnder",
              target: { filter: aegiocHusmon, count: 1 },
              underFilter: jupitermon,
              position: "top",
              optional: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [
        {
          effectTextPart:
            "[Security] You may play 1 play cost 5 or lower [TS] trait card from your hand without paying the cost.",
          kind: "PlayWithoutCost",
          target: { filter: tsSecurity, count: 1 },
          from: ["hand"],
          payCost: false,
          optional: true,
        },
        { kind: "AddToHandSelf" },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT26-097", compiled);
