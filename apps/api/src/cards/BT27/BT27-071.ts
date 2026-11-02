import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };

const deDigivolve = (trigger: "WhenAttacking" | "Counter"): CardEffect => ({
  trigger,
  frequency: "OncePerTurn",
  sharedUseKey: "BT27-071/de-digivolve",
  actions: [
    {
      kind: "DeDigivolve",
      effectTextPart: "＜De-Digivolve 2＞ 1 of your opponent's Digimon.",
      target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
      amount: 2,
    },
  ],
});

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Reboot" }, { keyword: "Blocker" }, { keyword: "Armor Purge" }],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "GrantStatic",
          effectTextPart: "Your opponent's Digimon effects don't affect this Digimon until their turn ends.",
          target: self,
          grant: "immuneToOpponentDigimonEffects",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    deDigivolve("WhenAttacking"),
    deDigivolve("Counter"),
    {
      trigger: "AllTurns",
      actions: [{ kind: "Restrict", target: self, restriction: "digivolve", duration: "permanent" }],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { namesExact: ["Thunderbirdmon"], traits: ["Bio"], cost: 5, isAlternate: true },
    { baseIsTamer: true, traits: ["Kurata's Army"], cost: 7, isAlternate: true },
  ],
};

registerIrCard("BT27-071", compiled);
