import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const suspendAndRestrict = (): Action[] => [
  {
    kind: "SelectBind",
    target: {
      filter: {
        controller: "opponent",
        kind: ["Digimon"],
      },
      count: 1,
      bindAs: "suspended",
    },
    condition: {
      kind: "securityAtLeast",
      value: 3,
    },
  },
  {
    kind: "Suspend",
    target: {
      fromSelectionRef: "suspended",
      filter: {},
      count: 1,
    },
    condition: {
      kind: "securityAtLeast",
      value: 3,
    },
  },
  {
    kind: "Restrict",
    target: {
      fromSelectionRef: "suspended",
      filter: {},
      count: 1,
    },
    restriction: "unsuspendDuringOwnUnsuspendPhase",
    duration: "untilOpponentNextUnsuspendPhase",
    condition: {
      kind: "securityAtLeast",
      value: 3,
    },
  },
  {
    kind: "GainMemory",
    amount: 2,
    condition: {
      kind: "zoneCount",
      seat: "mine",
      zone: "security",
      op: "lte",
      value: 3,
      raw: "you have 3 or fewer security cards",
    },
  },
];
const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: suspendAndRestrict(),
    },
    {
      trigger: "WhenDigivolving",
      actions: suspendAndRestrict(),
    },
    {
      trigger: "EndOfAttack",
      actions: [
        {
          kind: "Unsuspend",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          condition: {
            kind: "selfTopHasText",
            filter: {
              nameOrTrait: [{ tokens: ["Pulsemon"], match: "text" }],
            },
            raw: "this Digimon has [Pulsemon] in its text",
          },
          cost: {
            kind: "trash",
            target: {
              filter: {
                controller: "mine",
              },
              count: 1,
            },
            raw: "by trashing the top card of your security stack",
          },
          optional: true,
          abortOnDecline: true,
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 4,
      texts: ["Pulsemon"],
      cost: 3,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT16-044", compiled);
export { compiled };
