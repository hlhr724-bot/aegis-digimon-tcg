import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const opponents: Target = { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" };
const lowestCost: Target = { ...opponents, filter: { ...opponents.filter, superlative: "lowestPlayCost" } };

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            '[Main] Give 1 of your opponent\'s Digimon "[Start of Your Main Phase] This Digimon attacks." until their turn ends.',
          kind: "GainTriggeredEffect",
          target: { ...opponents, count: 1 },
          gainedTrigger: "StartOfYourMainPhase",
          gainedActions: [{ kind: "Attack", target: { filter: { isSelfRef: true }, count: 1, isSelf: true } }],
          duration: "untilOpponentTurnEnd",
          raw: "[Start of Your Main Phase] This Digimon attacks.",
        },
        { effectTextPart: "Then, place this card in the battle area.", kind: "PlaceInBattleAreaSelf" },
      ],
    },
    {
      trigger: "AllTurns",
      keywords: [{ keyword: "Delay" }],
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["Craniamon"], match: "name" }],
          },
          actions: [
            { kind: "DeDigivolve", target: opponents, amount: 1 },
            { kind: "Delete", target: lowestCost },
          ],
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [{ kind: "Delete", target: lowestCost }, { kind: "AddToHandSelf" }],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-100", compiled);
