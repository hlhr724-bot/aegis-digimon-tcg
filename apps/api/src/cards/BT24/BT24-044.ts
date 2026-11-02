import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const avian = {
  or: [
    { nameOrTrait: [{ tokens: ["Avian", "Bird"], match: "traitContains" as const }] },
    { nameOrTrait: [{ tokens: ["Vortex Warriors"], match: "trait" as const }] },
  ],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "Suspend",
          target: {
            filter: { controllerDefault: "any", kind: ["Digimon"], levelComparison: { op: "lte", value: 6 } },
            count: 1,
          },
          optional: true,
        },
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 [Shoto Kazama]",
              filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Shoto Kazama"], match: "nameExact" }] },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart:
                "1 card with [Avian] or [Bird] in any of its traits or the [Vortex Warriors] trait among them to the hand.",
              filter: { controllerDefault: "mine", ...avian },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
          condition: { kind: "lastSuspendedIsMine" },
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenDeletesInBattle",
          sourceFilter: { isSelfRef: true },
          actions: [{ kind: "GainMemory", amount: 1 }],
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT24-044", compiled);
