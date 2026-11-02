import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [{ filter: { controllerDefault: "mine", kind: ["Tamer"], colors: ["Blue"] }, count: "all", to: "hand" }],
          rest: "deckBottom",
          cost: {
            kind: "suspend",
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            raw: "By suspending this Digimon",
          },
        },
      ],
      frequency: "OncePerTurn",
    },
    {
      trigger: "Static",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenAttacking",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "ActivateEffect",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Tamer"],
                  nameOrTrait: [{ tokens: ["Rina Shinomiya"], match: "name" }],
                },
                count: 1,
              },
              effectType: "OnPlay",
              count: 1,
            },
          ],
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT11-029", compiled);
