import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const trashBottomSourceThenDraw: Action[] = [
  {
    kind: "TrashDigivolution",
    effectTextPart: "Trash the bottom digivolution card of 1 of your opponent's Digimon.",
    target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
    amount: 1,
    fromTop: false,
  },
  {
    kind: "Draw",
    effectTextPart: "Then, if your opponent has no Digimon with digivolution cards, ＜Draw 1＞.",
    controller: "mine",
    amount: 1,
    condition: {
      kind: "opponentHasNone",
      filter: { digivolutionCards: "hasAny", controllerDefault: "opponent", kind: ["Digimon"] },
      raw: "your opponent has no Digimon with digivolution cards",
    },
  },
];

export const compiled: CompiledCard = {
  effects: [
    { trigger: "WhenMoving", actions: trashBottomSourceThenDraw },
    { trigger: "OnPlay", actions: trashBottomSourceThenDraw },
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
      trigger: "WhenAttacking",
      isInherited: true,
      actions: [
        {
          kind: "RedirectAttack",
          effectTextPart:
            "If this Digimon has the [Ice-Snow] trait, you may change the attack target to 1 of your opponent's unsuspended Digimon with the fewest digivolution cards.",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              unsuspended: true,
              superlative: "lowestDigivolutionCards",
            },
            count: 1,
          },
          optional: true,
          condition: {
            kind: "selfHasTrait",
            filter: { nameOrTrait: [{ tokens: ["Ice-Snow"], match: "trait" }] },
            raw: "this Digimon has the [Ice-Snow] trait",
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST26-02", compiled);
