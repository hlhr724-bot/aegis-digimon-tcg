import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 [Eosmon]",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Eosmon"],
                    match: "nameExact",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 [Menoa Bellucci] among them to the hand.",
              filter: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Menoa Bellucci"],
                    match: "nameExact",
                  },
                ],
              },
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
        {
          effectTextPart:
            "Then, by placing this Digimon as 1 of your [Eosmon]'s bottom digivolution card, you may play 1 [Menoa Bellucci] from your hand without paying the cost.",
          kind: "PlayWithoutCost",
          target: {
            filter: {
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Menoa Bellucci"],
                  match: "nameExact",
                },
              ],
            },
            count: 1,
          },
          from: ["hand"],
          payCost: false,
          cost: {
            kind: "place",
            target: {
              filter: { isSelfRef: true },
              count: 1,
              isSelf: true,
            },
            targetIsPermanent: true,
            destination: "digivolutionStack",
            position: "bottom",
            host: "target",
            underFilter: {
              controller: "mine",
              nameOrTrait: [
                {
                  tokens: ["Eosmon"],
                  match: "nameExact",
                },
              ],
            },
            raw: "by placing this Digimon as 1 of your [Eosmon]'s bottom digivolution card",
          },
          optional: true,
          abortOnDecline: true,
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: {
            controllerDefault: "mine",
            excludeSelf: true,
            nameOrTrait: [
              {
                tokens: ["Eosmon"],
                match: "nameExact",
              },
            ],
          },
          actions: [
            {
              kind: "Digivolve",
              target: {
                filter: { isSelfRef: true },
                count: 1,
                isSelf: true,
              },
              into: {
                controllerDefault: "mine",
                nameOrTrait: [
                  {
                    tokens: ["Eosmon"],
                    match: "nameExact",
                  },
                ],
              },
              from: ["hand"],
              payCost: true,
              reduceCost: 3,
              ignoreRequirements: false,
              optional: true,
            },
          ],
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("P-112", compiled);
