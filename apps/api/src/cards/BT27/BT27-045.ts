import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          effectTextPart:
            "[On Play] Reveal the top 3 cards of your deck. Add 1 card with [Leomon] in its name and 1 [Unique], [Boss] or [ACCEL] trait card among them to the hand. Return the rest to the bottom of the deck.",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 card with [Leomon] in its name",
              filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Leomon"], match: "name" }] },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 [Unique], [Boss] or [ACCEL] trait card among them to the hand.",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [{ tokens: ["Unique", "Boss", "ACCEL"], match: "trait" }],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      trigger: "YourTurn",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenBattleWon",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "GainMemory",
              effectTextPart: "[Your Turn] [Once Per Turn] When this Digimon wins a battle, gain 1 memory.",
              amount: 1,
            },
          ],
        },
      ],
    },
  ],
  digivolutionRequirement: [
    { namesExact: ["Frimon", "Kyaromon"], cost: 0, isAlternate: true },
    { level: 2, traits: ["ACCEL"], cost: 0, isAlternate: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-045", compiled);
