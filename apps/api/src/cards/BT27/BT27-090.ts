import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Filter, Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };

const leomonBossOrDataSquad: Filter["nameOrTrait"] = [
  { tokens: ["Leomon"], match: "name" },
  { tokens: ["Boss", "DATA SQUAD"], match: "trait" },
];

const protectedDigimon: Target = { fromSelectionRef: "spencerProtectedDigimon", filter: {}, count: 1 };

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourTurn",
      actions: [{ kind: "SetMemory", value: 3, condition: { kind: "memoryAtMost", value: 2 } }],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: { controller: "mine", kind: ["Digimon"], nameOrTrait: leomonBossOrDataSquad },
          optional: true,
          cost: {
            kind: "place",
            targetIsPermanent: true,
            target: self,
            destination: "digivolutionStack",
            position: "bottom",
            host: "triggerSource",
            raw: "by placing this Tamer as any of those Digimon's bottom digivolution card",
          },
          actions: [
            {
              kind: "SelectBind",
              effectTextPart:
                "your opponent's effects can't return 1 of your Digimon to hands or decks, or trash its stacked cards until their turn ends.",
              target: {
                filter: { controller: "mine", kind: ["Digimon"] },
                count: 1,
                bindAs: "spencerProtectedDigimon",
              },
            },
            {
              kind: "Restrict",
              target: protectedDigimon,
              restriction: "cannotReturnToHandOrDeck",
              byOpponentEffectsOnly: true,
              duration: "untilOpponentTurnEnd",
            },
            { kind: "StackTrashLock", target: protectedDigimon, duration: "untilOpponentTurnEnd" },
          ],
          raw: "When any of your Digimon with [Leomon] in their names or the [Boss] or [DATA SQUAD] trait are played, by placing this Tamer as any of those Digimon's bottom digivolution card, your opponent's effects can't return 1 of your Digimon to hands or decks, or trash its stacked cards until their turn ends.",
        },
      ],
    },
    {
      trigger: "AllTurns",
      isInherited: true,
      actions: [
        {
          kind: "ModifyDP",
          target: self,
          amount: 3000,
          duration: "permanent",
          condition: {
            kind: "selfTopHasText",
            filter: { nameOrTrait: leomonBossOrDataSquad },
            raw: "this Digimon has [Leomon] in its name or the [Boss] or [DATA SQUAD] trait",
          },
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

registerIrCard("BT27-090", compiled);
