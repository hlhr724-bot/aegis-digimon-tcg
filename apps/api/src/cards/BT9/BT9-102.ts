import type { CompiledCard, Cost } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const handCost: Cost = {
  kind: "trash",
  target: {
    filter: {
      zone: "hand",
      controller: "mine",
      nameOrTrait: [{ tokens: ["Cyborg", "Machine"], match: "trait" }],
    },
    count: 1,
  },
  raw: "by trashing 1 card with [Cyborg] or [Machine] in its traits in your hand",
};
const securityHandCost: Cost = {
  kind: "trash",
  target: {
    filter: {
      zone: "hand",
      controller: "mine",
      nameOrTrait: [{ tokens: ["Cyborg", "Machine"], match: "trait" }],
    },
    count: 1,
  },
  bindResultAs: "trashedSecurityCard",
  raw: "by trashing 1 card with [Cyborg] or [Machine] in its traits in your hand",
};
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] You may trash 1 card with [Cyborg] or [Machine] in its traits in your hand to have all of your level 6 Digimon with [Machine] in their traits gain ＜Rush＞ (This Digimon can attack the turn it comes into play) and “[On Play] If this Digimon has a digivolution card, ＜Blitz＞. (This Digimon can attack when your opponent has 1 or more memory.)” for the turn.",
          payCostBeforeOptional: false,
          kind: "GainKeyword",
          target: { filter: { controller: "mine", kind: ["Digimon"], levels: [6], traits: ["Machine"] }, count: "all" },
          keyword: { keyword: "Rush" },
          duration: "forTheTurn",
          cost: handCost,
          optional: true,
          includeLaterEntrants: true,
          // Rush applies immediately on entry, before the gained On Play Blitz resolves.
          playerWide: true,
        },
        {
          effectTextPart:
            "[Main] You may trash 1 card with [Cyborg] or [Machine] in its traits in your hand to have all of your level 6 Digimon with [Machine] in their traits gain ＜Rush＞ (This Digimon can attack the turn it comes into play) and “[On Play] If this Digimon has a digivolution card, ＜Blitz＞. (This Digimon can attack when your opponent has 1 or more memory.)” for the turn.",
          kind: "GrantStatic",
          target: { filter: { controller: "mine", kind: ["Digimon"], levels: [6], traits: ["Machine"] }, count: "all" },
          grant: "effects",
          tokens: ["OnPlayBlitzIfHasDigivolutionCard"],
          duration: "forTheTurn",
          condition: { kind: "ifThisEffectActed", raw: "you did" },
          includeLaterEntrants: true,
        },
      ],
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "Delete",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              relativeTo: { attr: "playCost", op: "lte", selectionRef: "trashedSecurityCard" },
            },
            count: 1,
          },
          cost: securityHandCost,
          optional: true,
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT9-102", compiled);
