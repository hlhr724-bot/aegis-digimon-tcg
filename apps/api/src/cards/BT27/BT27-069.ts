import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import type { KeywordRef } from "@aegis/shared/effects/ir/keywords";
import type { AssemblyRequirement } from "@aegis/shared/effects/ir/requirements/fusion";
import { registerIrCard } from "#api/engine/effects/interpreter";

const chessmonName = [{ tokens: ["Chessmon"], match: "name" as const }];
const chessmonAssembly: AssemblyRequirement = {
  reduceCost: 5,
  materials: [5, 4, 3].map((level) => ({ count: 1, level, nameOrTrait: chessmonName })),
};
const overclock: KeywordRef = { keyword: "Overclock", raw: "＜Overclock ([Chessmon] in name)＞" };
const deletionText =
  "[All Turns] [Once Per Turn] When any of your other Digimon with [Chessmon] in their names are deleted, delete 1 of your opponent's lowest play cost Digimon. If this effect didn't delete, trash their top security card.";

const deDigivolveThree: Action = {
  kind: "DeDigivolve",
  effectTextPart: "[On Play] [When Digivolving] ＜De-Digivolve 3＞ 1 of your opponent's Digimon.",
  target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
  amount: 3,
};

const deDigivolveWindow = (trigger: "OnPlay" | "WhenDigivolving"): CardEffect => ({
  trigger,
  actions: [deDigivolveThree],
});

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Rush", raw: "＜Rush＞" }, overclock, { keyword: "Blocker", raw: "＜Blocker＞" }],
    },
    {
      trigger: "EndOfYourTurn",
      keywords: [overclock],
      actions: [
        {
          kind: "Attack",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          attackTargetScope: "player",
          withoutSuspending: true,
          optional: true,
          abortOnDecline: true,
          cost: {
            kind: "deleteOwn",
            mechanic: "Overclock",
            target: {
              filter: {
                controller: "mine",
                excludeSelf: true,
                kind: ["Digimon"],
                nameOrTrait: chessmonName,
                allowTokens: true,
              },
              count: 1,
            },
            raw: "by deleting 1 of your Tokens or other Digimon with [Chessmon] in their names",
          },
        },
      ],
    },
    deDigivolveWindow("OnPlay"),
    deDigivolveWindow("WhenDigivolving"),
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          effectTextPart: deletionText,
          event: "onDeletionOf",
          sourceFilter: { controller: "mine", excludeSelf: true, kind: ["Digimon"], nameOrTrait: chessmonName },
          actions: [
            {
              kind: "Delete",
              effectTextPart: "delete 1 of your opponent's lowest play cost Digimon.",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestPlayCost" },
                count: 1,
              },
            },
            {
              kind: "SecurityManipulation",
              effectTextPart: "If this effect didn't delete, trash their top security card.",
              op: "trashTop",
              controller: "opponent",
              condition: { kind: "ifThisEffectDidNotDelete", raw: "this effect didn't delete" },
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { level: 5, names: ["Chessmon"], cost: 3, isAlternate: true },
    { level: 5, traits: ["DATA SQUAD"], cost: 3, isAlternate: true },
  ],
  assemblyRequirement: [chessmonAssembly],
};

registerIrCard("BT27-069", compiled);
