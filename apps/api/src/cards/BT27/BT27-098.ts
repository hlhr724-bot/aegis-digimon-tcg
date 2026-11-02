import type { CompiledCard, Target } from "@aegis/shared";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          sourceFilter: { kind: ["Digimon"] },
          optional: true,
          cost: { kind: "suspend", target: self, raw: "by suspending this Tamer" },
          actions: [
            { kind: "PlaceUnder", target: { filter: {}, count: 1 }, fromDeckTop: true, position: "bottom" },
            { kind: "PlaceUnder", target: { filter: {}, count: 1 }, fromDeckTop: true, position: "bottom" },
          ],
          raw: "When any Digimon are deleted, by suspending this Tamer, you may place the top 2 cards of your deck face down under this Tamer.",
        },
      ],
    },
    {
      trigger: "EndOfAllTurns",
      actions: [
        {
          kind: "CostGatedBlock",
          optional: true,
          abortOnDecline: true,
          cost: {
            kind: "trashBottomFaceDownUnderTamer",
            controller: "mine",
            count: 5,
            raw: "By trashing 5 bottom face-down cards from under any of your Tamers",
          },
          actions: [
            {
              effectTextPart:
                "you may play 1 Digimon card with [Gizmon] or [Belphemon] in its name from your hand or trash without paying the cost.",
              kind: "PlayWithoutCost",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["Gizmon", "Belphemon"], match: "name" }],
                },
                count: 1,
              },
              from: ["hand", "trash"],
              payCost: false,
              bindResultAs: "playedKurataDigimon",
            },
            {
              effectTextPart: "After, place this Tamer as its bottom digivolution card.",
              kind: "PlaceUnder",
              target: self,
              underFilter: { controller: "mine", boundRef: "playedKurataDigimon", lastPlayed: true },
              position: "bottom",
            },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [{ kind: "PlayWithoutCost", target: self, payCost: false }],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-098", compiled);
