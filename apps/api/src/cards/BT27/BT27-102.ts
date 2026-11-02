import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const kurataArmy: Filter["nameOrTrait"] = [{ tokens: ["Kurata's Army"], match: "trait" }];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] You may play 1 [Kurata's Army] trait Tamer card from your hand or trash without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: { controller: "mine", kind: ["Tamer"], nameOrTrait: kurataArmy },
            count: 1,
          },
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
        },
        { kind: "PlaceInBattleAreaSelf" },
      ],
    },
    {
      trigger: "AllTurns",
      keywords: [{ keyword: "Delay", raw: "＜Delay＞" }],
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          sourceFilter: { controller: "any", kind: ["Digimon"] },
          actions: [
            {
              effectTextPart:
                "1 of your Tamers may digivolve into a [Kurata's Army] trait Digimon card in the hand or trash without paying the cost.",
              kind: "Digivolve",
              target: { filter: { controller: "mine", kind: ["Tamer"] }, count: 1 },
              into: { controllerDefault: "mine", kind: ["Digimon"], nameOrTrait: kurataArmy },
              from: ["hand", "trash"],
              payCost: false,
              optional: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: { controller: "mine", kind: ["Digimon", "Tamer"], playCostLte: 5, nameOrTrait: kurataArmy },
            count: 1,
          },
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-102", compiled);
