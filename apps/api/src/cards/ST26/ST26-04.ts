import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const trashThreeSourcesThenLockSuspend: Action[] = [
  {
    kind: "TrashDigivolution",
    effectTextPart: "Trash any 3 digivolution cards from your opponent's Digimon.",
    target: { filter: { controller: "opponent", kind: ["Digimon"], digivolutionCards: "hasAny" }, count: "all" },
    amount: 3,
    scope: "acrossDigimon",
  },
  {
    kind: "Restrict",
    effectTextPart: "Then, 1 of their Digimon or Tamers can't suspend until their turn ends.",
    target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 1 },
    restriction: "suspend",
    duration: "untilOpponentTurnEnd",
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "IceClad", raw: "＜Iceclad＞" }] },
    { trigger: "OnPlay", actions: trashThreeSourcesThenLockSuspend },
    { trigger: "WhenDigivolving", actions: trashThreeSourcesThenLockSuspend },
    {
      trigger: "Rule",
      actions: [
        {
          kind: "GrantStatic",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          grant: "trait",
          tokens: ["Ice-Snow"],
        },
      ],
    },
    {
      trigger: "EndOfYourTurn",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "TrashDigivolution",
          effectTextPart: "Trash the bottom 2 digivolution cards of 1 of your opponent's Digimon.",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: 2,
          fromTop: false,
        },
        {
          kind: "Unsuspend",
          effectTextPart: "If this effect didn't trash, this [Ice-Snow] trait Digimon may unsuspend.",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          optional: true,
          condition: {
            kind: "allOf",
            conditions: [
              { kind: "ifThisEffectDidNotAct" },
              { kind: "selfHasTrait", filter: { nameOrTrait: [{ tokens: ["Ice-Snow"], match: "trait" }] } },
            ],
            raw: "this effect didn't trash and this Digimon has the [Ice-Snow] trait",
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST26-04", compiled);
