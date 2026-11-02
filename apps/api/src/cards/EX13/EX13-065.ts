import type { Action, CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const sistermonBlancFromOwnStack: Filter = {
  controller: "mine",
  kind: ["Digimon"],
  hostFilter: { isSelfRef: true },
  nameOrTrait: [{ tokens: ["Sistermon Blanc"], match: "nameExact" }],
};

const decodeReplacement: Action[] = [
  {
    kind: "Replacement",
    event: "wouldLeavePlay",
    leaveCause: "otherThanBattle",
    sourceFilter: { isSelfRef: true },
    actions: [
      {
        kind: "PlayWithoutCost",
        target: { filter: sistermonBlancFromOwnStack, count: 1 },
        from: ["digivolutionCards"],
        payCost: false,
        playedByDecode: true,
        optional: true,
      },
    ],
    raw: "＜Decode ([Sistermon Blanc])＞ (When this Digimon would leave the battle area other than in battle, you may play 1 [Sistermon Blanc] from its digivolution cards without paying the cost.)",
  },
];

export const compiled: CompiledCard = {
  cardId: "EX13-065",
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Decode", raw: "＜Decode ([Sistermon Blanc])＞" }],
    },
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Guard", raw: "＜Guard＞" }],
    },
    {
      trigger: "AllTurns",
      actions: decodeReplacement,
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] You may play 1 play cost 4 or lower card with [Sistermon] from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              playCostLte: 4,
              nameOrTrait: [{ tokens: ["Sistermon"], match: "name" }],
            },
            count: 1,
          },
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
          raw: "You may play 1 play cost 4 or lower card with [Sistermon] from your hand or trash without paying the cost",
        },
        {
          effectTextPart: "Then, to 1 of your opponent's Digimon, give -3000 DP for the turn for each of your Digimon.",
          kind: "ModifyDP",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: -3000,
          duration: "forTheTurn",
          scaling: { per: 1, unit: "cards", filter: { controllerDefault: "mine", kind: ["Digimon"] } },
          raw: "Then, to 1 of your opponent's Digimon, give -3000 DP for the turn for each of your Digimon",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { namesExact: ["Sistermon Blanc"], cost: 0, isAlternate: true },
    { level: 2, texts: ["Huckmon"], cost: 1, isAlternate: true },
  ],
};

registerIrCard("EX13-065", compiled);
