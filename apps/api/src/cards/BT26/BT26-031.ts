import type { Action, CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const opponentDigimon = { controller: "opponent", kind: ["Digimon"] } satisfies Filter;
const glowingDawn = {
  controller: "mine",
  zone: ["battleArea", "breeding"],
  nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
} satisfies Filter;
const recovery = [
  {
    kind: "CostGatedBlock",
    cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine" },
    optional: true,
    abortOnDecline: true,
    actions: [{ kind: "Recover", amount: 1 }],
  },
] satisfies Action[];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        { kind: "RecoverByTrashingMostSecurity", recover: false },
        {
          kind: "SelectBind",
          target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 1, bindAs: "suspendLocked" },
          condition: { kind: "ifThisEffectActed" },
        },
        {
          kind: "Restrict",
          target: { fromSelectionRef: "suspendLocked", filter: {}, count: 1 },
          restriction: "suspend",
          blocksCombatSuspend: true,
          duration: "untilOpponentTurnEnd",
          condition: { kind: "ifThisEffectActed" },
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      frequency: "OncePerTurn",
      sharedUseKey: "BT26-031/tamer-trash-recovery",
      actions: recovery,
    },
    {
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      sharedUseKey: "BT26-031/tamer-trash-recovery",
      actions: recovery,
    },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: { kind: "youHave", filter: glowingDawn },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] 1 of your opponent's Digimon gets -8000 DP until their turn ends.",
          kind: "SelectBind",
          target: { filter: opponentDigimon, count: 1, bindAs: "murashigureTarget" },
        },
        {
          effectTextPart: "[Main] 1 of your opponent's Digimon gets -8000 DP until their turn ends.",
          kind: "ModifyDP",
          target: { filter: {}, count: 1, fromSelectionRef: "murashigureTarget" },
          amount: -8000,
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart: "By trashing your top security card, it further gets -5000 DP.",
          kind: "CostGatedBlock",
          cost: { kind: "trashSecurityTop", controller: "mine" },
          optional: true,
          abortOnDecline: true,
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: {}, count: 1, fromSelectionRef: "murashigureTarget" },
              amount: -5000,
              duration: "untilOpponentTurnEnd",
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 4, traits: ["Glowing Dawn"], cost: 3, isAlternate: true }],
};

registerIrCard("BT26-031", compiled);
