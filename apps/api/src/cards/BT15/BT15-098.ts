import type { CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const myotismon: Filter = {
  controller: "mine",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["Myotismon"], match: "nameExact" }],
};
const venomMyotismon: Filter = {
  controller: "mine",
  kind: ["Digimon"],
  nameOrTrait: [{ tokens: ["VenomMyotismon"], match: "nameExact" }],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: {
            kind: "deleteOwn",
            target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            raw: "By deleting 1 of your Digimon",
            declineViaSelection: true,
          },
          optional: true,
          abortOnDecline: true,
          actions: [
            {
              effectTextPart:
                "[Main] By deleting 1 of your Digimon, you may play 1 [Myotismon] from your trash without paying the cost.",
              kind: "PlayWithoutCost",
              target: { filter: myotismon, count: 1 },
              from: ["trash"],
              payCost: false,
              optional: true,
            },
            { kind: "PlaceInBattleAreaSelf" },
          ],
        },
      ],
    },
    {
      trigger: "AllTurns",
      keywords: [{ keyword: "Delay", raw: "＜Delay＞" }],
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          sourceFilter: myotismon,
          actions: [
            {
              effectTextPart: "You may play 1 [VenomMyotismon] from your trash without paying the cost.",
              kind: "PlayWithoutCost",
              target: { filter: venomMyotismon, count: 1 },
              from: ["trash"],
              payCost: false,
              optional: true,
            },
          ],
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "PlaceInBattleAreaSelf" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT15-098", compiled);
