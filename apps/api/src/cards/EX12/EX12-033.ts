import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -4000,
          duration: "untilYourTurnEnd",
          optional: true,
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
              },
              count: 3,
              upTo: true,
            },
            raw: "By trashing up to 3 cards from your hand",
          },
          scaling: {
            per: 1,
            usePaidCount: true,
            filter: {
              controllerDefault: "mine",
            },
            unit: "cards",
          },
        },
      ],
    },
    {
      trigger: "WhenAttacking",
      actions: [
        {
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -4000,
          duration: "untilYourTurnEnd",
          optional: true,
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
              },
              count: 3,
              upTo: true,
            },
            raw: "By trashing up to 3 cards from your hand",
          },
          scaling: {
            per: 1,
            usePaidCount: true,
            filter: {
              controllerDefault: "mine",
            },
            unit: "cards",
          },
        },
      ],
    },
    {
      trigger: "Counter",
      actions: [
        {
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -4000,
          duration: "untilYourTurnEnd",
          optional: true,
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
              },
              count: 3,
              upTo: true,
            },
            raw: "By trashing up to 3 cards from your hand",
          },
          scaling: {
            per: 1,
            usePaidCount: true,
            filter: {
              controllerDefault: "mine",
            },
            unit: "cards",
          },
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          affectsAll: true,
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
            nameOrTrait: [
              {
                tokens: ["Jellymon"],
                match: "text",
              },
              {
                tokens: ["DS"],
                match: "trait",
              },
            ],
          },
          actions: [
            {
              kind: "Prevent",
              mode: "leavePlay",
              cost: {
                kind: "return",
                target: {
                  filter: {
                    zone: "trash",
                    controller: "mine",
                  },
                  count: 3,
                },
                raw: "by returning 3 cards from your trash to the bottom of the deck",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
        },
      ],
      frequency: "OncePerTurn",
    },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          condition: {
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              zone: ["battleArea", "breeding"],
              nameOrTrait: [
                {
                  tokens: ["DS"],
                  match: "trait",
                },
              ],
            },
            raw: "you have a card w/[DS] trait",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Trash any 4 cards under your opponent's Digimon or Tamers.",
          kind: "TrashDigivolution",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon", "Tamer"],
              digivolutionCards: "hasAny",
            },
            count: "all",
          },
          scope: "acrossDigimon",
          amount: 4,
          fromTop: false,
        },
        {
          effectTextPart:
            "Then, you may return 1 of your opponent's Digimon or Tamers without cards under it to the hand.",
          kind: "Return",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon", "Tamer"],
              digivolutionCards: "none",
            },
            count: 1,
          },
          to: "hand",
          optional: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 5,
      texts: ["Jellymon"],
      cost: 3,
      isAlternate: true,
    },
    {
      traits: ["DS"],
      cost: 3,
      isAlternate: true,
      level: 5,
    },
  ],
};

registerIrCard("EX12-033", compiled);
