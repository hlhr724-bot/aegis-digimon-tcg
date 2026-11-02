import type { Action, CardEffect, CompiledCard, KeywordRef } from "@aegis/shared";
import { registerIrCard } from "#api/engine/effects/interpreter";

const overclock: KeywordRef = { keyword: "Overclock", raw: "＜Overclock ([Chuumon]/[Sukamon] in name)＞" };

const chuumonSukamonOrEtemon = [{ tokens: ["Chuumon", "Sukamon", "Etemon"], match: "name" as const }];

const scaledDpReduction: Action = {
  effectTextPart:
    "To 1 of your opponent's Digimon, give -3000 DP for the turn for each of your Digimon with [Chuumon], [Sukamon] or [Etemon] in their names.",
  kind: "ModifyDP",
  target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
  amount: -3000,
  duration: "forTheTurn",
  scaling: {
    per: 1,
    filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: chuumonSukamonOrEtemon },
    unit: "cards",
  },
};

const dpReductionEffect = (trigger: "Security" | "OnPlay" | "WhenDigivolving"): CardEffect => ({
  trigger,
  ...(trigger === "Security" ? { isSecurity: true } : {}),
  actions: [scaledDpReduction],
});

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [overclock] },
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
                nameOrTrait: [{ tokens: ["Chuumon", "Sukamon"], match: "name" }],
                allowTokens: true,
              },
              count: 1,
            },
            raw: "by deleting 1 of your Tokens or other Digimon with [Chuumon] or [Sukamon] in their names",
          },
        },
      ],
    },
    dpReductionEffect("Security"),
    dpReductionEffect("OnPlay"),
    dpReductionEffect("WhenDigivolving"),
    {
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: {
            controllerDefault: "mine",
            excludeSelf: true,
            kind: ["Digimon"],
            nameOrTrait: chuumonSukamonOrEtemon,
          },
          actions: [
            {
              effectTextPart: "＜De-Digivolve 1＞ 1 of your opponent's Digimon.",
              kind: "DeDigivolve",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              amount: 1,
            },
          ],
          raw: "When any of your other Digimon with [Chuumon], [Sukamon] or [Etemon] in their names are played, ＜De-Digivolve 1＞ 1 of your opponent's Digimon.",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 4, names: ["Sukamon"], cost: 3, isAlternate: true }],
  assemblyRequirement: [{ reduceCost: 3, materials: [{ count: 1, kinds: ["Digimon"], names: ["Sukamon"], level: 4 }] }],
};

registerIrCard("BT27-040", compiled);
