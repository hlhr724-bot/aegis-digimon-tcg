import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const unsuspendByTrashingSecurity: Action[] = [
  {
    kind: "Unsuspend",
    effectTextPart: "By trashing your top security card, this Digimon unsuspends.",
    target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
    cost: {
      kind: "trash",
      target: { filter: { controller: "mine", zone: "security", position: "top" }, count: 1 },
      raw: "By trashing your top security card",
    },
    optional: true,
    abortOnDecline: true,
  },
];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Blocker" }, { keyword: "Barrier" }, { keyword: "Ascension" }],
    },
    {
      trigger: "WhenDigivolving",
      frequency: "OncePerTurn",
      sharedUseKey: "unsuspend",
      actions: unsuspendByTrashingSecurity,
    },
    {
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      sharedUseKey: "unsuspend",
      actions: unsuspendByTrashingSecurity,
    },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          sourceFilter: { controller: "mine" },
          raw: "When your security stack is removed from",
          actions: [
            {
              kind: "CostGatedBlock",
              cost: {
                kind: "place",
                target: {
                  filter: {
                    controller: "mine",
                    hostFilter: { isSelfRef: true },
                    nameOrTrait: [
                      { tokens: ["Kentaurosmon"], match: "nameExact" },
                      { tokens: ["X Antibody"], match: "nameExact" },
                    ],
                  },
                  count: 1,
                  from: ["digivolutionCards"],
                },
                destination: "security",
                position: "bottom",
                raw: "by placing 1 [Kentaurosmon] or [X Antibody] from this Digimon's digivolution cards as the bottom security card",
              },
              optional: true,
              abortOnDecline: true,
              actions: [{ kind: "ActivateMain" }],
            },
          ],
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          kind: "ModifyDP",
          effectTextPart:
            "1 of your opponent's Digimon gets -20000 DP until their turn ends. For each card in both players' security stacks, add 1000 to this effect's DP reduction.",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: -20000,
          duration: "untilOpponentTurnEnd",
          scaling: { per: 1, bonus: 1000, unit: "security", filter: { controller: "any" } },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ namesExact: ["Kentaurosmon"], cost: 2, isAlternate: true }],
};

registerIrCard("BT27-043", compiled);
