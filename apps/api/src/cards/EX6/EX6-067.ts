import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Unsuspend 1 of your Digimon with the [Angel]/[Archangel]/[Three Great Angels]\u00a0trait. If you have [Dominimon], unsuspend all of your Digimon with the [Angel]/[Archangel]/[Three Great Angels]\u00a0trait instead.",
          kind: "Unsuspend",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Angel", "Archangel", "Three Great Angels"],
                  match: "trait",
                },
              ],
            },
            count: 1,
          },
          condition: {
            kind: "youHaveNone",
            filter: {
              controllerDefault: "mine",
              nameOrTrait: [
                {
                  tokens: ["Dominimon"],
                  match: "nameExact",
                },
              ],
            },
            raw: "you don't have [Dominimon]",
          },
        },
        {
          effectTextPart:
            "[Main] Unsuspend 1 of your Digimon with the [Angel]/[Archangel]/[Three Great Angels]\u00a0trait. If you have [Dominimon], unsuspend all of your Digimon with the [Angel]/[Archangel]/[Three Great Angels]\u00a0trait instead.",
          kind: "Unsuspend",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Angel", "Archangel", "Three Great Angels"],
                  match: "trait",
                },
              ],
            },
            count: "all",
          },
          condition: {
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              nameOrTrait: [
                {
                  tokens: ["Dominimon"],
                  match: "nameExact",
                },
              ],
            },
            raw: "you have [Dominimon]",
          },
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          effectTextPart: "[Security] ＜Recovery +1 (Deck)＞.",
          kind: "GainKeyword",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          keyword: {
            keyword: "Recovery",
            amount: 1,
            raw: "＜Recovery +1 (Deck)＞",
          },
          duration: "permanent",
        },
        {
          effectTextPart: "Then, add this card to the hand.",
          kind: "AddToHandSelf",
        },
      ],
      isSecurity: true,
      keywords: [
        {
          keyword: "Recovery",
          amount: 1,
          raw: "＜Recovery +1 (Deck)＞",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX6-067", compiled);
