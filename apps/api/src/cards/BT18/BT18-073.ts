import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          sourceFilter: {
            controllerDefault: "mine",
          },
          actions: [
            {
              kind: "Replacement",
              event: "wouldBePlayed",
              mode: "reduceCost",
              amount: 4,
              raw: "reduce the play cost by 4",
              cost: {
                kind: "deleteOwn",
                target: {
                  filter: {
                    controller: "mine",
                    kind: ["Digimon"],
                    nameOrTrait: [
                      {
                        tokens: ["Composite"],
                        match: "trait",
                      },
                    ],
                  },
                  count: 1,
                },
                raw: "by deleting 1 of your Digimon with the [Composite] trait",
              },
              optional: true,
              abortOnDecline: true,
            },
          ],
          raw: "wouldBePlayed",
        },
      ],
    },
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "DeDigivolve",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: "all",
          },
          amount: 1,
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "DeDigivolve",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: "all",
          },
          amount: 1,
        },
      ],
    },
    {
      trigger: "OnDeletion",
      actions: [
        {
          kind: "DnaDigivolve",
          materials: {
            filter: {
              zone: "battleArea",
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Kimeramon"],
                  match: "nameExact",
                },
              ],
            },
            count: 1,
          },
          looseMaterials: {
            filter: {
              zone: "trash",
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [
                {
                  tokens: ["Machinedramon"],
                  match: "nameExact",
                },
              ],
            },
            count: 1,
            from: ["trash"],
          },
          into: {
            zone: "hand",
            controller: "mine",
            kind: ["Digimon"],
            nameOrTrait: [
              {
                tokens: ["Millenniummon"],
                match: "nameExact",
              },
            ],
            hasDnaDigivolutionRequirement: true,
          },
          payCost: true,
          optional: true,
        },
      ],
    },
    {
      trigger: "Rule",
      actions: [
        {
          kind: "GrantStatic",
          target: {
            filter: {
              isSelfRef: true,
            },
            count: 1,
            isSelf: true,
          },
          grant: "trait",
          tokens: ["Composite"],
        },
      ],
    },
    {
      trigger: "OpponentsTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenOpponentAttacks",
          actions: [
            {
              kind: "RedirectAttack",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  nameOrTrait: [
                    {
                      tokens: ["Composite", "Wicked God"],
                      match: "trait",
                    },
                  ],
                },
                count: 1,
              },
              optional: true,
            },
          ],
          raw: "whenOpponentAttacks",
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 5,
      traits: ["Composite"],
      cost: 3,
      isAlternate: true,
    },
  ],
};

registerIrCard("BT18-073", compiled);
