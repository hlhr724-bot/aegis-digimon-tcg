import type { Action, CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const knightmonText = [{ tokens: ["Knightmon"], match: "text" as const }];

const ownKnightmonTextDigimon = {
  controller: "mine",
  kind: ["Digimon"],
  nameOrTrait: knightmonText,
} satisfies Filter;

const otherOwnDigimon = { controller: "mine", kind: ["Digimon"], excludeSelf: true } satisfies Filter;

const ONCE_PER_TURN_KEY = "BT27-084/activate-option-main";

const activateOptionMainBySourceTrash: Action = {
  kind: "CostGatedBlock",
  cost: {
    kind: "trash",
    target: {
      filter: {
        isSelfRef: true,
        zone: "digivolutionCards",
        nameOrTrait: [
          { tokens: ["LordKnightmon"], match: "nameExact" },
          { tokens: ["X Antibody"], match: "nameExact" },
        ],
      },
      count: 1,
    },
    raw: "by trashing 1 [LordKnightmon] or [X Antibody] from this Digimon's digivolution cards",
  },
  optional: true,
  abortOnDecline: true,
  actions: [{ kind: "ActivateMain" }],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        { keyword: "Alliance", raw: "＜Alliance＞" },
        { keyword: "Collision", raw: "＜Collision＞" },
        { keyword: "Piercing", raw: "＜Piercing＞" },
        { keyword: "Blocker", raw: "＜Blocker＞" },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "PlayMultiple",
          filter: { controllerDefault: "mine", kind: ["Digimon", "Tamer"], nameOrTrait: knightmonText },
          from: ["hand"],
          payCost: false,
          totalCost: 8,
          optional: true,
        },
      ],
    },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: otherOwnDigimon,
          oncePerTurnKey: ONCE_PER_TURN_KEY,
          actions: [activateOptionMainBySourceTrash],
        },
        {
          kind: "SubTrigger",
          event: "onDeletionOf",
          sourceFilter: otherOwnDigimon,
          oncePerTurnKey: ONCE_PER_TURN_KEY,
          actions: [activateOptionMainBySourceTrash],
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestLevel" }, count: 1 },
        },
        {
          kind: "GainKeyword",
          effectTextPart: "All of your Digimon with [Knightmon] in their texts gain ＜Blocker＞.",
          target: { filter: ownKnightmonTextDigimon, count: "all" },
          playerWide: true,
          keyword: { keyword: "Blocker", raw: "＜Blocker＞" },
          duration: "untilYourTurnEnd",
          condition: { kind: "ifThisEffectDidNotDelete", raw: "this effect didn't delete" },
        },
        {
          kind: "GrantStatic",
          effectTextPart:
            "Your opponent's Digimon effects don't affect any of your Digimon with [Knightmon] in their texts.",
          target: { filter: ownKnightmonTextDigimon, count: "all" },
          playerWide: true,
          grant: "immuneToOpponentDigimonEffects",
          duration: "untilYourTurnEnd",
          condition: { kind: "ifThisEffectDidNotDelete", raw: "this effect didn't delete" },
        },
        {
          kind: "ModifyDP",
          effectTextPart: "All of your Digimon with [Knightmon] in their texts get +3000 DP.",
          target: { filter: ownKnightmonTextDigimon, count: "all" },
          playerWide: true,
          amount: 3000,
          duration: "untilYourTurnEnd",
          condition: { kind: "ifThisEffectDidNotDelete", raw: "this effect didn't delete" },
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [{ namesExact: ["LordKnightmon"], cost: 2, isAlternate: true }],
};

registerIrCard("BT27-084", compiled);
