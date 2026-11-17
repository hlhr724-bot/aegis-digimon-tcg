import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const iceSnow = [{ tokens: ["Ice-Snow"], match: "trait" as const }];
const yourIceSnowDigimon: Filter = { controller: "mine", kind: ["Digimon"], nameOrTrait: iceSnow };
const opponentDigimonWithoutSources: Filter = {
  controller: "opponent",
  kind: ["Digimon"],
  digivolutionCards: "none",
};

const trashTopTwoThenLock: Action[] = [
  {
    kind: "TrashDigivolution",
    effectTextPart: "Trash the top 2 digivolution cards of all of your opponent's Digimon.",
    target: { filter: { controller: "opponent", kind: ["Digimon"], digivolutionCards: "hasAny" }, count: "all" },
    amount: 2,
    fromTop: true,
  },
  {
    kind: "Restrict",
    effectTextPart:
      "Then, until their turn ends, none of their Digimon without digivolution cards can digivolve or suspend.",
    target: { filter: opponentDigimonWithoutSources, count: "all" },
    restriction: "digivolve",
    whileMatchesTargetFilter: true,
    duration: "untilOpponentTurnEnd",
  },
  {
    kind: "Restrict",
    target: { filter: opponentDigimonWithoutSources, count: "all" },
    restriction: "suspend",
    whileMatchesTargetFilter: true,
    duration: "untilOpponentTurnEnd",
  },
];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        { keyword: "IceClad", raw: "＜Iceclad＞" },
        { keyword: "Piercing", raw: "＜Piercing＞" },
        { keyword: "Blocker", raw: "＜Blocker＞" },
      ],
    },
    { trigger: "OnPlay", actions: trashTopTwoThenLock },
    { trigger: "WhenDigivolving", actions: trashTopTwoThenLock },
    {
      trigger: "EndOfYourTurn",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "GainKeyword",
          effectTextPart:
            "[End of Your Turn] [Once Per Turn] If your opponent has no Digimon with digivolution cards, 1 of your [Ice-Snow] trait Digimon may gain ＜Rush＞ for the turn and attack.",
          condition: {
            kind: "opponentHasNone",
            filter: { digivolutionCards: "hasAny", controllerDefault: "opponent", kind: ["Digimon"] },
            raw: "your opponent has no Digimon with digivolution cards",
          },
          target: { filter: yourIceSnowDigimon, count: 1 },
          keyword: { keyword: "Rush", raw: "＜Rush＞" },
          duration: "forTheTurn",
          optional: true,
          abortOnDecline: true,
        },
        {
          kind: "Attack",
          drainTimingWindowDuringAttack: true,
          target: { filter: yourIceSnowDigimon, count: 1, sameTarget: true },
          condition: { kind: "ifThisEffectActed" },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  assemblyRequirement: [
    {
      materials: [
        { count: 1, level: 5, nameOrTrait: iceSnow },
        { count: 1, level: 4, nameOrTrait: iceSnow },
        { count: 1, level: 3, nameOrTrait: iceSnow },
      ],
      reduceCost: 5,
    },
  ],
};

registerIrCard("BT27-033", compiled);
