import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const activateOption: Action[] = [
  {
    kind: "ActivateMain",
    effectTextPart: "You may activate 1 [Main] effect on this card's Option side.",
    optional: true,
  },
];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Raid" }, { keyword: "Piercing" }, { keyword: "Engage" }],
    },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          mode: "prevent",
          sourceFilter: { isSelfRef: true },
          actions: [],
          cost: {
            kind: "trashBottomFaceDownUnderTamer",
            controller: "mine",
            count: 2,
            raw: "by trashing 2 bottom face-down cards from under any of your Tamers, it doesn't leave",
          },
        },
      ],
    },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        { kind: "SubTrigger", event: "whenAttackTargetSwitched", actions: activateOption },
        {
          kind: "SubTrigger",
          event: "whenDigivolutionTrashed",
          sourceFilter: { controller: "mine", kind: ["Tamer"], byEffect: true },
          actions: activateOption,
        },
      ],
    },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: {
            kind: "youHave",
            filter: {
              controller: "mine",
              zone: ["battleArea", "breeding"],
              nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
            },
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          kind: "DeDigivolve",
          effectTextPart: "[Main] ＜De-Digivolve 2＞ 1 of your opponent's Digimon.",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: 2,
        },
        {
          kind: "Unsuspend",
          effectTextPart: "Then, 1 of your Digimon unsuspends and gets +5000 DP until your turn ends.",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
        },
        {
          kind: "ModifyDP",
          target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1, sameTarget: true },
          amount: 5000,
          duration: "untilYourTurnEnd",
        },
      ],
    },
  ],
  digivolutionRequirement: [{ level: 5, traits: ["Glowing Dawn"], cost: 3, isAlternate: true }],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-067", compiled);
