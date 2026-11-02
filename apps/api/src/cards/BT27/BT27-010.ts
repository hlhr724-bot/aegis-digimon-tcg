import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const deletion: Action = {
  kind: "Delete",
  target: { filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 6000 } }, count: 1 },
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "ReactivateEffect",
          fromTrigger: "OnDeletion",
          count: 1,
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          cost: { kind: "payMemory", memory: 1 },
          optional: true,
        },
      ],
    },
    { trigger: "OnDeletion", actions: [deletion] },
    { trigger: "OnDeletion", isInherited: true, actions: [deletion] },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-010", compiled);
