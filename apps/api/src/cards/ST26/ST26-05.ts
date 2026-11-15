import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        { keyword: "IceClad", raw: "＜Iceclad＞" },
        { keyword: "Piercing", raw: "＜Piercing＞" },
        { keyword: "Blocker", raw: "＜Blocker＞" },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "TrashDigivolution",
          effectTextPart: "Trash any 3 digivolution cards from your opponent's Digimon.",
          target: {
            filter: { controller: "opponent", kind: ["Digimon"], digivolutionCards: "hasAny" },
            count: "all",
          },
          amount: 3,
          scope: "acrossDigimon",
        },
        {
          kind: "Attack",
          effectTextPart:
            "Then, if your opponent has no Digimon with digivolution cards, 1 of your [Ice-Snow] trait Digimon may attack without suspending.",
          target: {
            filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["Ice-Snow"], match: "trait" }] },
            count: 1,
          },
          withoutSuspending: true,
          optional: true,
          condition: {
            kind: "opponentHasNone",
            filter: { digivolutionCards: "hasAny", controllerDefault: "opponent", kind: ["Digimon"] },
            raw: "your opponent has no Digimon with digivolution cards",
          },
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "Return",
          effectTextPart:
            "You may return 1 of your opponent's Digimon with no digivolution cards to the bottom of the deck.",
          target: { filter: { controller: "opponent", kind: ["Digimon"], digivolutionCards: "none" }, count: 1 },
          to: "deckBottom",
          optional: true,
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          kind: "TrashDigivolution",
          effectTextPart: "Trash all cards from under 1 of your opponent's Digimon or Tamers.",
          target: {
            filter: { controller: "opponent", kind: ["Digimon", "Tamer"], digivolutionCards: "hasAny" },
            count: 1,
          },
          amount: "all",
        },
        {
          kind: "Restrict",
          effectTextPart: "Then, 2 of their Digimon or Tamers can't suspend until their turn ends.",
          target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 2 },
          restriction: "suspend",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST26-05", compiled);
