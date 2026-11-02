import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };

const deDigivolveThenDelete = (trigger: "OnPlay" | "WhenDigivolving"): CardEffect => ({
  trigger,
  actions: [
    {
      kind: "DeDigivolve",
      effectTextPart: "[On Play] [When Digivolving] ＜De-Digivolve 1＞ 1 of your opponent's Digimon.",
      target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
      amount: 1,
    },
    {
      kind: "Delete",
      effectTextPart:
        "Then, if during an attack, delete 1 of your opponent's Digimon with as much DP as this Digimon or less.",
      target: {
        filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", relativeToSource: true } },
        count: 1,
      },
      condition: { kind: "duringAttack", raw: "during an attack" },
    },
  ],
});

export const compiled: CompiledCard = {
  effects: [
    deDigivolveThenDelete("OnPlay"),
    deDigivolveThenDelete("WhenDigivolving"),
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          sourceFilter: { controller: "opponent" },
          fireCondition: { kind: "triggerRemovedSecuritySeat", seat: "opponent" },
          actions: [
            {
              kind: "Digivolve",
              effectTextPart:
                "[Your Turn] When your opponent's security stack is removed from, this Digimon may digivolve into a [Chronicle] trait Digimon card in the hand or trash.",
              target: self,
              into: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Chronicle"], match: "trait" }],
              },
              from: ["hand", "trash"],
              payCost: true,
              optional: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "OpponentsTurn",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOpponentAttacks",
          actions: [
            {
              kind: "RedirectAttack",
              effectTextPart:
                "[Opponent's Turn] [Once Per Turn] When one of your opponent's Digimon attacks, you may change the attack target to 1 of your [Chronicle] trait Digimon.",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Chronicle"], match: "trait" }],
                },
                count: 1,
              },
              optional: true,
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { namesExact: ["Ginryumon"], cost: 3, isAlternate: true },
    { level: 4, traits: ["Chronicle"], cost: 3, isAlternate: true },
  ],
};

registerIrCard("BT27-013", compiled);
