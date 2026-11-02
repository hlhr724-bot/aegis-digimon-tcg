import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CardEffect, CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const chronicle = [{ tokens: ["Chronicle"], match: "trait" as const }];
const chronicleTamer: Filter = { controller: "mine", zone: "hand", kind: ["Tamer"], nameOrTrait: chronicle };
const chronicleOption: Filter = { controller: "mine", zone: "hand", kind: ["Option"], nameOrTrait: chronicle };

const deleteThenTrashSecurity = (trigger: "OnPlay" | "WhenDigivolving"): CardEffect => ({
  trigger,
  actions: [
    {
      kind: "Delete",
      effectTextPart:
        "[On Play] [When Digivolving] Delete 1 of your opponent's Digimon with as much DP as 1 of your Digimon or less.",
      target: {
        filter: {
          controller: "opponent",
          kind: ["Digimon"],
          dp: { op: "lte", relativeToFilter: { controller: "mine", kind: ["Digimon"] } },
        },
        count: 1,
      },
    },
    {
      kind: "Trash",
      effectTextPart: "Then, if during an attack, trash their top security card.",
      target: { filter: { controller: "opponent", zone: "security", position: "top" }, count: 1 },
      condition: { kind: "duringAttack", raw: "during an attack" },
    },
  ],
});

const playOrUseChronicleCard: Action = {
  kind: "Modal",
  choose: 1,
  labels: ["Play a [Chronicle] Tamer", "Use a [Chronicle] Option"],
  options: [
    [
      {
        kind: "PlayWithoutCost",
        target: { filter: chronicleTamer, count: 1 },
        from: ["hand"],
        payCost: false,
        optional: true,
        raw: "You may play 1 [Chronicle] trait Tamer card from your hand without paying the cost",
      },
    ],
    [
      {
        kind: "UseOptionWithoutCost",
        filter: chronicleOption,
        from: ["hand"],
        payCost: false,
        optional: true,
        raw: "You may use 1 [Chronicle] trait Option card from your hand without paying the cost",
      },
    ],
  ],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        { keyword: "Piercing", raw: "＜Piercing＞" },
        { keyword: "Reboot", raw: "＜Reboot＞" },
        { keyword: "Blocker", raw: "＜Blocker＞" },
      ],
    },
    deleteThenTrashSecurity("OnPlay"),
    deleteThenTrashSecurity("WhenDigivolving"),
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          sourceFilter: { controller: "any" },
          raw: "When security stacks are removed from, you may play or use 1 [Chronicle] trait Tamer or Option card from your hand without paying the cost.",
          actions: [playOrUseChronicleCard],
        },
      ],
    },
    {
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          sourceFilter: { controller: "any" },
          fireCondition: {
            kind: "selfHasName",
            names: ["Alphamon: Ouryuken"],
            raw: "this Digimon is [Alphamon: Ouryuken]",
          },
          actions: [
            {
              kind: "Unsuspend",
              effectTextPart:
                "[All Turns] [Once Per Turn] When security stacks are removed from, this [Alphamon: Ouryuken] may unsuspend.",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
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
    { namesExact: ["Hisyaryumon"], cost: 3, isAlternate: true },
    { level: 5, traits: ["Chronicle"], cost: 3, isAlternate: true },
  ],
  assemblyRequirement: [
    {
      materials: [
        { count: 1, level: 5, nameOrTrait: chronicle },
        { count: 1, level: 4, nameOrTrait: chronicle },
        { count: 1, level: 3, nameOrTrait: chronicle },
      ],
      reduceCost: 5,
    },
  ],
};

registerIrCard("BT27-015", compiled);
