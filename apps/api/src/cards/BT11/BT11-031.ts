import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          effectTextPart: "[When Digivolving] Unsuspend this Digimon.",
          kind: "Unsuspend",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        },
        {
          effectTextPart:
            "Then, if a card with [Blue Flare] or [Xros Heart] in its traits is in this Digimon's digivolution cards and your opponent has 2 or more Digimon in play, gain 2 memory.",
          kind: "GainMemory",
          amount: 2,
          condition: {
            kind: "allOf",
            conditions: [
              {
                kind: "selfDigivolutionStackHasTrait",
                filter: { nameOrTrait: [{ tokens: ["Blue Flare", "Xros Heart"], match: "trait" }] },
              },
              {
                kind: "opponentHas",
                filter: { zone: "battleArea", controller: "opponent", kind: ["Digimon"] },
                countMin: 2,
              },
            ],
            raw: "a card with [Blue Flare] or [Xros Heart] in this Digimon's digivolution cards and your opponent has 2 or more Digimon in play",
          },
        },
      ],
    },
    {
      trigger: "OnDeletion",
      actions: [
        {
          kind: "PlaceUnder",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          underFilter: { controller: "mine", kind: ["Tamer"] },
          optional: true,
        },
        {
          kind: "PlaceUnder",
          target: {
            filter: {
              zone: "trash",
              controller: "mine",
              colors: ["Blue"],
              nameOrTrait: [{ tokens: ["Greymon"], match: "nameExact" }],
            },
            count: 1,
            from: ["trash"],
          },
          underFilter: { controller: "mine", kind: ["Tamer"], nameOrTrait: [{ tokens: ["General"], match: "trait" }] },
          bindHostAs: "zeigGeneral",
        },
        {
          kind: "PlaceUnder",
          target: {
            filter: {
              zone: "trash",
              controller: "mine",
              colors: ["Blue"],
              nameOrTrait: [{ tokens: ["MailBirdramon"], match: "nameExact" }],
            },
            count: 1,
            from: ["trash"],
          },
          underSelectionRef: "zeigGeneral",
          underFilter: { controller: "mine", kind: ["Tamer"], nameOrTrait: [{ tokens: ["General"], match: "trait" }] },
        },
      ],
      keywords: [{ keyword: "Save", raw: "＜Save＞" }],
    },
    {
      trigger: "OpponentsTurn",
      actions: [
        {
          kind: "Aura",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          effect: { kind: "keyword", keyword: { keyword: "Blocker", raw: "＜Blocker＞" } },
          while: {
            kind: "selfHasTrait",
            filter: { nameOrTrait: [{ tokens: ["Blue Flare"], match: "trait" }] },
            raw: "this Digimon has [Blue Flare] in its traits",
          },
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ cost: 2, isAlternate: true, namesExact: ["MetalGreymon"] }],
};

registerIrCard("BT11-031", compiled);
