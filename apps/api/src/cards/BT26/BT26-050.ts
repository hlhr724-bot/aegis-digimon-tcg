import type { Action, CompiledCard, Target } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const anyDigimonTamer = { filter: { controller: "any", kind: ["Digimon", "Tamer"] }, count: 2 } satisfies Target;
const opponentDigimonTamer = {
  filter: { controller: "opponent", kind: ["Digimon", "Tamer"] },
  count: 2,
} satisfies Target;
// "None of their suspended Digimon or Tamers" is overall processing with a condition: it also
// covers cards that suspend after the Option resolves (Comprehensive Rules 15-11-2-3-3).
const opponentSuspendedDigimonTamers = {
  filter: { controller: "opponent", kind: ["Digimon", "Tamer"], suspended: true },
  count: "all",
} satisfies Target;
const suspendLock = [
  {
    effectTextPart: "[When Digivolving] You may suspend 2 Digimon or Tamers.",
    kind: "Suspend",
    target: anyDigimonTamer,
    optional: true,
  },
  {
    effectTextPart: "Then, 2 of your opponent's Digimon or Tamers can't unsuspend until their turn ends.",
    kind: "Restrict",
    target: opponentDigimonTamer,
    restriction: "unsuspend",
    duration: "untilOpponentTurnEnd",
  },
] satisfies Action[];
const securityCost = {
  kind: "Return",
  target: { filter: { controller: "any", kind: ["Digimon"], suspended: true, excludeSelf: true }, count: 1 },
  to: "deckBottom",
  optional: true,
} satisfies Action;
const trashSecurity = {
  kind: "SecurityManipulation",
  op: "trashTop",
  controller: "opponent",
  amount: 1,
  condition: { kind: "ifThisEffectActed" },
} satisfies Action;
export const compiled: CompiledCard = {
  effects: [
    { trigger: "WhenDigivolving", actions: suspendLock },
    { trigger: "WhenDigivolving", actions: [securityCost, trashSecurity] },
    { trigger: "WhenAttacking", actions: [securityCost, trashSecurity] },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          condition: {
            kind: "youHave",
            filter: {
              controllerDefault: "mine",
              zone: ["battleArea", "breeding"],
              nameOrTrait: [{ tokens: ["DATA SQUAD"], match: "trait" }],
            },
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart: "[Main] Suspend 2 of your opponent's Digimon or Tamers.",
          kind: "Suspend",
          target: opponentDigimonTamer,
        },
        {
          effectTextPart:
            "Then, until their turn ends, none of their suspended Digimon or Tamers can digivolve or unsuspend.",
          kind: "Restrict",
          target: opponentSuspendedDigimonTamers,
          restriction: "digivolve",
          duration: "untilOpponentTurnEnd",
          whileMatchesTargetFilter: true,
        },
        {
          effectTextPart:
            "Then, until their turn ends, none of their suspended Digimon or Tamers can digivolve or unsuspend.",
          kind: "Restrict",
          target: opponentSuspendedDigimonTamers,
          restriction: "unsuspend",
          duration: "untilOpponentTurnEnd",
          whileMatchesTargetFilter: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { level: 6, traits: ["DATA SQUAD"], cost: 5, isAlternate: true },
    {
      cost: 0,
      isAlternate: true,
      namesExact: ["Rosemon"],
      burstDigivolve: { returnTamerNamesExact: ["Yoshino Fujieda"] },
    },
  ],
};
registerIrCard("BT26-050", compiled);
export default compiled;
