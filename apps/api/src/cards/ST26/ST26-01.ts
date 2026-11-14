import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "YourTurn",
      isInherited: true,
      actions: [
        {
          kind: "Aura",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          effect: { kind: "restriction", restriction: "beDeletedInBattle" },
          while: {
            kind: "allOf",
            conditions: [
              { kind: "selfHasTrait", filter: { nameOrTrait: [{ tokens: ["Ice-Snow"], match: "trait" }] } },
              {
                kind: "opponentHasNone",
                filter: { digivolutionCards: "hasAny", controllerDefault: "opponent", kind: ["Digimon"] },
              },
            ],
            raw: "your opponent has no Digimon with digivolution cards and this Digimon has the [Ice-Snow] trait",
          },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("ST26-01", compiled);
