import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };

const suspendAndLock: Action[] = [
  {
    kind: "Suspend",
    effectTextPart: "Suspend up to 2 of your opponent's Digimon or Tamers.",
    target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 2, upTo: true },
  },
  {
    kind: "Restrict",
    effectTextPart: "Then, 1 of their Digimon or Tamers can't unsuspend until their turn ends.",
    target: { filter: { controller: "opponent", kind: ["Digimon", "Tamer"] }, count: 1 },
    restriction: "unsuspend",
    duration: "untilOpponentTurnEnd",
  },
];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Piercing" }, { keyword: "Vortex" }, { keyword: "Armor Purge" }],
    },
    {
      trigger: "WhenDigivolving",
      frequency: "OncePerTurn",
      sharedUseKey: "BT27-055/suspend-lock",
      actions: suspendAndLock,
    },
    {
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      sharedUseKey: "BT27-055/suspend-lock",
      actions: suspendAndLock,
    },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: { controllerDefault: "any", kind: ["Digimon"] },
          actions: [
            { kind: "Unsuspend", target: { ...self, filter: { isSelfRef: true, zone: "battleArea" } }, optional: true },
          ],
          raw: "When any Digimon suspend, this Digimon may unsuspend.",
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [{ kind: "Restrict", target: self, restriction: "digivolve", duration: "permanent" }],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { namesExact: ["Quetzalmon"], traits: ["Bio"], cost: 5, isAlternate: true },
    { baseIsTamer: true, traits: ["Kurata's Army"], cost: 7, isAlternate: true },
  ],
};

registerIrCard("BT27-055", compiled);
