import type { CompiledCard, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const marcusTarget = {
  filter: {
    controller: "mine",
    kind: ["Tamer"],
    nameOrTrait: [{ tokens: ["Marcus Damon"], match: "name" }],
  },
  count: "all",
} satisfies Target;

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "GainKeyword",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          keyword: { keyword: "Raid" },
          duration: "permanent",
        },
        {
          kind: "GainKeyword",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          keyword: { keyword: "Piercing" },
          duration: "permanent",
        },
        {
          kind: "GainKeyword",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          keyword: { keyword: "SecurityAttack", amount: 1 },
          duration: "permanent",
        },
        {
          kind: "GainKeyword",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          keyword: { keyword: "Blocker" },
          duration: "permanent",
        },
        {
          kind: "GainKeyword",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          keyword: { keyword: "Barrier" },
          duration: "permanent",
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      frequency: "OncePerTurn",
      sharedUseKey: "bt25-104/activate-option-main",
      actions: [{ kind: "ActivateMain" }],
    },
    {
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      sharedUseKey: "bt25-104/activate-option-main",
      actions: [{ kind: "ActivateMain" }],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "GrantStatic",
          target: marcusTarget,
          grant: "kinds",
          tokens: ["Digimon"],
          duration: "permanent",
        },
        {
          kind: "SetBaseDP",
          target: marcusTarget,
          value: 12000,
          duration: "permanent",
        },
        {
          kind: "GainKeyword",
          target: marcusTarget,
          keyword: { keyword: "Rush", raw: "＜Rush＞" },
          duration: "permanent",
        },
      ],
    },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          condition: {
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              zone: ["battleArea", "breeding"],
              kind: ["Digimon", "Tamer"],
              nameOrTrait: [{ tokens: ["DATA SQUAD"], match: "trait" }],
            },
            raw: "you have a card w/[DATA SQUAD] trait",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] 1 of your opponent's Digimon gets -15000 DP for the turn.",
          kind: "ModifyDP",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: -15000,
          duration: "forTheTurn",
        },
        {
          effectTextPart: "Then, you may play 1 Tamer card from your hand without paying the cost.",
          kind: "PlayWithoutCost",
          target: { filter: { controller: "mine", kind: ["Tamer"] }, count: 1, upTo: true },
          optional: true,
          payCost: false,
          from: ["hand"],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      cost: 5,
      isAlternate: true,
      level: 6,
      traits: ["DATA SQUAD"],
    },
    {
      cost: 0,
      isAlternate: true,
      namesExact: ["ShineGreymon"],
      burstDigivolve: { returnTamerNamesExact: ["Marcus Damon"] },
    },
  ],
};

registerIrCard("BT25-104", compiled);

export default compiled;
