import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Return",
          target: {
            filter: {
              zone: "trash",
              controller: "mine",
              or: [
                {
                  nameOrTrait: [{ tokens: ["Hybrid", "Ten Warriors"], match: "trait" }],
                },
                {
                  kind: ["Tamer"],
                  hasInheritedEffects: true,
                },
              ],
            },
            count: 1,
          },
          to: "hand",
          optional: true,
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "ModifyDP",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          amount: 2000,
          duration: "permanent",
        },
      ],
      isInherited: true,
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      names: ["Takuya Kanbara"],
      cost: 2,
      isAlternate: true,
    },
    {
      names: ["BurningGreymon"],
      cost: 0,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT18-011", compiled);
export { compiled };
