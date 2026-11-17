import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 [Ice-Snow] or [ALYSION] trait card",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [{ tokens: ["Ice-Snow", "ALYSION"], match: "trait" }],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 blue Tamer card among them to the hand.",
              filter: { controllerDefault: "mine", kind: ["Tamer"], colors: ["Blue"] },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
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

registerIrCard("BT27-022", compiled);
