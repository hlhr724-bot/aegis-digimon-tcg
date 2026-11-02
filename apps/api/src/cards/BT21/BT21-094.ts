import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Reveal the top 3 cards of your deck. Add 1 card with [Davis Motomiya] in its name in its name and 1 card with the [Free] trait among them to the hand. Trash the rest.",
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 card with [Davis Motomiya] in its name",
              filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Davis Motomiya"], match: "name" }] },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 card with the [Free] trait among them to the hand.",
              filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Free"], match: "trait" }] },
              count: 1,
              to: "hand",
            },
          ],
          rest: "trash",
        },
        { effectTextPart: "Then, place this card in the battle area.", kind: "PlaceInBattleAreaSelf" },
      ],
    },
    {
      trigger: "AllTurns",
      keywords: [{ keyword: "Delay", raw: "＜Delay＞" }],
      actions: [
        {
          kind: "SubTrigger",
          event: "whenDigimonTopTrashed",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["Armor Form"], match: "trait" }],
          },
          actions: [
            {
              kind: "Digivolve",
              target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
              into: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Armor Form"], match: "trait" }],
              },
              payCost: false,
              from: ["hand"],
              optional: true,
            },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      actions: [{ kind: "ActivateMain" }],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT21-094", compiled);
