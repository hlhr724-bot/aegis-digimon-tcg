import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const playValnerDragnogh: Action = {
  kind: "PlayWithoutCost",
  effectTextPart:
    "If you have 1 or fewer Tamers, you may play 1 [Valner Dragnogh] from your hand without paying the cost.",
  target: {
    filter: { controller: "mine", nameOrTrait: [{ tokens: ["Valner Dragnogh"], match: "nameExact" }] },
    count: 1,
  },
  from: ["hand"],
  payCost: false,
  condition: {
    kind: "youHave",
    filter: { controllerDefault: "mine", kind: ["Tamer"], countMax: 1 },
    raw: "you have 1 or fewer Tamers",
  },
  optional: true,
};

export const compiled: CompiledCard = {
  effects: [
    { trigger: "OnPlay", actions: [playValnerDragnogh] },
    { trigger: "WhenDigivolving", actions: [playValnerDragnogh] },
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
      trigger: "EndOfAttack",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [{ kind: "GainMemory", amount: 1 }],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST26-03", compiled);
