import type { Action, CompiledCard, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const self = { filter: { isSelfRef: true }, count: 1, isSelf: true } satisfies Target;
const immuneAndDp = [
  {
    kind: "Restrict",
    target: self,
    restriction: "beAffected",
    duration: "untilOpponentTurnEnd",
    fromSourceKind: ["Digimon"],
    byOpponentEffectsOnly: true,
  },
  { kind: "ModifyDP", target: self, amount: 3000, duration: "untilOpponentTurnEnd" },
] satisfies Action[];
const unsuspend = { kind: "Unsuspend", target: self, optional: true } satisfies Action;
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 1 },
          optional: true,
          abortOnDecline: true,
          actions: immuneAndDp,
        },
      ],
    },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        { kind: "SubTrigger", event: "whenAttackTargetSwitched", actions: [unsuspend] },
        {
          kind: "SubTrigger",
          event: "whenDigivolutionTrashed",
          sourceFilter: { controller: "mine", kind: ["Tamer"], byEffect: true },
          actions: [unsuspend],
        },
      ],
    },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: {
            kind: "youHave",
            filter: {
              controller: "mine",
              zone: ["battleArea", "breeding"],
              nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
            },
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] ＜De-Digivolve 1＞ 1 of your opponent's Digimon.",
          kind: "DeDigivolve",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          amount: 1,
        },
        {
          effectTextPart:
            'Then, give 1 of your opponent\'s Digimon "[Start of Your Main Phase] This Digimon attacks." until their turn ends.',
          kind: "GainTriggeredEffect",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          gainedTrigger: "StartOfYourMainPhase",
          gainedActions: [{ kind: "Attack", target: self }],
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ level: 4, traits: ["Glowing Dawn"], cost: 3, isAlternate: true }],
};
registerIrCard("BT26-057", compiled);
export default compiled;
