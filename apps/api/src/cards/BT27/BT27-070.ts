import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const ownDigimon: Target = { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 };
const blocker: Target = { filter: { ...ownDigimon.filter, keywords: ["Blocker"] }, count: 1 };
const optionBonusText =
  "[Main] Until your opponent's turn ends, 1 of your Digimon with ＜Blocker＞ isn't affected by their Digimon effects and gets +5000 DP.";

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Reboot" }, { keyword: "Blocker" }] },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          mode: "prevent",
          optional: true,
          affectsAll: true,
          sourceFilter: ownDigimon.filter,
          target: { ...ownDigimon, count: "all" },
          cost: { kind: "suspend", target: self },
        },
      ],
    },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "Delete",
              effectTextPart:
                "[All Turns] [Once Per Turn] When this Digimon suspends, you may delete all of your opponent's lowest DP Digimon.",
              optional: true,
              target: { filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestDP" }, count: "all" },
            },
            {
              kind: "CostGatedBlock",
              effectTextPart:
                "Then, by trashing 1 [Craniamon] or [X Antibody] from this Digimon's digivolution cards, activate 1 [Main] effect on this card's Option side.",
              optional: true,
              cost: {
                kind: "trash",
                target: {
                  filter: {
                    isSelfRef: true,
                    zone: "digivolutionCards",
                    nameOrTrait: [{ tokens: ["Craniamon", "X Antibody"], match: "nameExact" }],
                  },
                  count: 1,
                },
              },
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
          kind: "GrantStatic",
          effectTextPart: optionBonusText,
          target: blocker,
          grant: "immuneToOpponentDigimonEffects",
          duration: "untilOpponentTurnEnd",
        },
        {
          kind: "ModifyDP",
          effectTextPart: optionBonusText,
          target: { ...blocker, sameTarget: true },
          amount: 5000,
          duration: "untilOpponentTurnEnd",
        },
        {
          kind: "Unsuspend",
          effectTextPart: "Then, 1 of your Digimon may unsuspend.",
          target: ownDigimon,
          optional: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ namesExact: ["Craniamon"], cost: 2, isAlternate: true }],
};

registerIrCard("BT27-070", compiled);
