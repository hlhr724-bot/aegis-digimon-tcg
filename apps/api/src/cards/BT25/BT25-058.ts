import type { CardEffect, CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const opponentDigimonOrTamer: Filter = { controller: "opponent", kind: ["Digimon", "Tamer"] };
const opponentDigimon: Filter = { controller: "opponent", kind: ["Digimon"] };
const triggeredDigimon: Filter = { controllerDefault: "any", kind: ["Digimon"] };

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "GainKeyword",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          keyword: { keyword: "Blocker" },
          duration: "permanent",
        },
        {
          kind: "GainKeyword",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          keyword: { keyword: "Fortitude" },
          duration: "permanent",
        },
      ],
      keywords: [
        { keyword: "Reboot", raw: "＜Reboot＞" },
        { keyword: "Blocker", raw: "＜Blocker＞" },
        { keyword: "Fortitude", raw: "＜Fortitude＞" },
      ],
    },
    ...(["OnPlay", "WhenDigivolving", "WhenAttacking"] as const).map((trigger): CardEffect => ({
      trigger,
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
      actions: [
        {
          effectTextPart:
            "[On Play] [When Digivolving] [When Attacking] [Once Per Turn] You may suspend 1 of your opponent's Digimon or Tamers.",
          kind: "Suspend",
          target: { filter: opponentDigimonOrTamer, count: 1 },
          optional: true,
        },
        {
          effectTextPart: "Then, 1 of their Digimon or Tamers can't unsuspend until their turn ends.",
          kind: "Restrict",
          target: { filter: opponentDigimonOrTamer, count: 1 },
          restriction: "unsuspend",
          duration: "untilOpponentTurnEnd",
        },
      ],
    })),
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: triggeredDigimon,
          actions: [
            {
              effectTextPart:
                "[All Turns] [Once Per Turn] When effects play or digivolve any Digimon, ＜De-Digivolve 1＞ 1 of your opponent's Digimon.",
              kind: "DeDigivolve",
              target: { filter: opponentDigimon, count: 1 },
              amount: 1,
              condition: { kind: "triggerPlayedOrDigivolvedByEffect" },
            },
            {
              effectTextPart: "Then, this Digimon may battle 1 of your opponent's Digimon.",
              kind: "Battle",
              attacker: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              target: { filter: opponentDigimon, count: 1 },
              optional: true,
              condition: { kind: "triggerPlayedOrDigivolvedByEffect" },
            },
          ],
        },
        {
          kind: "SubTrigger",
          event: "whenAnyDigivolves",
          sourceFilter: triggeredDigimon,
          actions: [
            {
              effectTextPart:
                "[All Turns] [Once Per Turn] When effects play or digivolve any Digimon, ＜De-Digivolve 1＞ 1 of your opponent's Digimon.",
              kind: "DeDigivolve",
              target: { filter: opponentDigimon, count: 1 },
              amount: 1,
              condition: { kind: "triggerPlayedOrDigivolvedByEffect" },
            },
            {
              effectTextPart: "Then, this Digimon may battle 1 of your opponent's Digimon.",
              kind: "Battle",
              attacker: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              target: { filter: opponentDigimon, count: 1 },
              optional: true,
              condition: { kind: "triggerPlayedOrDigivolvedByEffect" },
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    { level: 5, colors: ["Green"], cost: 5, isAlternate: false },
    { level: 5, colors: ["Black"], cost: 5, isAlternate: false },
    { level: 5, traits: ["TS"], cost: 4, isAlternate: true },
  ],
};

registerIrCard("BT25-058", compiled);
