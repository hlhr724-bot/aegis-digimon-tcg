import type { CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const sevenCode: Filter = {
  controller: "mine",
  kind: ["Digimon", "Tamer"],
  zone: ["battleArea", "breeding"],
  nameOrTrait: [{ tokens: ["Seven Code"], match: "trait" }],
};
const appmon: Filter = {
  controller: "mine",
  kind: ["Digimon", "Tamer"],
  playCostLte: 5,
  nameOrTrait: [{ tokens: ["Appmon"], match: "trait" }],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          condition: { kind: "youHave", filter: sevenCode },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] By placing 6 [Seven Code] trait Digimon cards from your battle area, link cards or trash as 1 of your [Seven Code] trait Digimon's bottom digivolution cards, that Digimon may digivolve into [Dantemon] in the hand, ignoring digivolution requirements and without paying the cost.",
          kind: "PlaceUnder",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Seven Code"], match: "trait" }],
            },
            count: 6,
          },
          destination: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Seven Code"], match: "trait" }],
            },
            count: 1,
          },
          bindHostAs: "sevenCodeHost",
          mixedSources: { battleAreaPermanents: true, linkedCards: true, trash: true },
          position: "bottom",
          order: "any",
          trackCount: "sevenCodeMaterials",
          optional: true,
          abortOnDecline: true,
        },
        {
          effectTextPart:
            "[Main] By placing 6 [Seven Code] trait Digimon cards from your battle area, link cards or trash as 1 of your [Seven Code] trait Digimon's bottom digivolution cards, that Digimon may digivolve into [Dantemon] in the hand, ignoring digivolution requirements and without paying the cost.",
          kind: "Digivolve",
          target: { filter: { boundRef: "sevenCodeHost" }, count: 1 },
          into: {
            filter: {
              controller: "mine",
              zone: "hand",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Dantemon"], match: "nameExact" }],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          ignoreRequirements: true,
          optional: true,
          condition: { kind: "namedCountAtLeast", countSource: "sevenCodeMaterials", count: 6 },
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [
        {
          effectTextPart:
            "[Security] You may play 1 play cost 5 or lower [Appmon] trait card from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: { filter: appmon, count: 1 },
          from: ["hand", "trash"],
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

registerIrCard("BT26-102", compiled);
