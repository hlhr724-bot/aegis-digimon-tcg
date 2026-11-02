import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import "./BT2-101.js";
import "./BT2-102.js";
import "./BT2-103.js";
import "./BT2-104.js";
import "./BT2-105.js";
import "./BT2-106.js";
import "./BT2-107.js";
import "./BT2-108.js";
import "./BT2-109.js";
import "./BT2-110.js";

const card = (cardId: string) => runtimeCompiledCard(cardId);

describe("BT2-101 through BT2-110 IR coverage", () => {
  it("registers every card with complete executable coverage", () => {
    for (const cardId of [
      "BT2-101",
      "BT2-102",
      "BT2-103",
      "BT2-104",
      "BT2-105",
      "BT2-106",
      "BT2-107",
      "BT2-108",
      "BT2-109",
      "BT2-110",
    ]) {
      expect(card(cardId), `${cardId} must register compiled IR`).toMatchObject({ coverage: "full", residual: [] });
    }
  });

  it("preserves printed triggers, gates, targets, security effects, and costs", () => {
    expect(card("BT2-101")?.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart: "[Main] Suspend all of your opponent's Digimon with 6000 DP or less.",
            kind: "Suspend",
            target: {
              filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 6000 } },
              count: "all",
            },
          },
        ],
      },
      { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
    ]);

    expect(card("BT2-102")?.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart:
              "[Main] Return 1 of your opponent's suspended Digimon to the bottom of their deck. (Trash all of the digivolution cards of that Digimon.)",
            kind: "Return",
            target: { filter: { controller: "opponent", suspended: true, kind: ["Digimon"] }, count: 1 },
            to: "deckBottom",
          },
        ],
      },
      { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
    ]);

    expect(card("BT2-103")?.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart: "[Main] 1 of your Digimon gets +3000 DP for the turn.",
            kind: "ModifyDP",
            target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            amount: 3000,
            duration: "forTheTurn",
          },
        ],
      },
      {
        trigger: "Security",
        actions: [
          {
            kind: "Unsuspend",
            target: { filter: { controller: "mine", kind: ["Digimon"], keywords: ["Blocker"] }, count: 1 },
          },
        ],
        isSecurity: true,
      },
    ]);

    expect(card("BT2-104")?.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart: "[Main] Unsuspend 1 of your Digimon with ＜Blocker＞.",
            kind: "Unsuspend",
            target: { filter: { controller: "mine", kind: ["Digimon"], keywords: ["Blocker"] }, count: 1 },
          },
        ],
      },
      {
        trigger: "Security",
        actions: [
          {
            kind: "Unsuspend",
            target: { filter: { controller: "mine", kind: ["Digimon"], keywords: ["Blocker"] }, count: "all" },
          },
          {
            kind: "ModifyDP",
            target: { filter: { controller: "mine", kind: ["Digimon"], keywords: ["Blocker"] }, count: "all" },
            amount: 5000,
            duration: "forTheTurn",
          },
        ],
        isSecurity: true,
      },
    ]);

    expect(card("BT2-105")?.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart:
              "[Main] Trigger ＜De-Digivolve 1＞ on 1 of your opponent's Digimon. (Trash 1 card from the top of one of your opponent's Digimon. If it has no digivolution cards, or becomes a level 3 Digimon, you can't trash any more cards.)",
            kind: "DeDigivolve",
            target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
            amount: 1,
          },
        ],
      },
      { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
    ]);

    expect(card("BT2-106")?.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart:
              "[Main] Trigger ＜De-Digivolve 4＞ on 1 of your opponent's Digimon. (Trash up to 4 cards from the top of one of your opponent's Digimon. If it has no digivolution cards, or becomes a level 3 Digimon, you can't trash any more cards.)",
            kind: "DeDigivolve",
            target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
            amount: 4,
          },
        ],
      },
      { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
    ]);

    expect(card("BT2-107")?.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart: "[Main] 1 of your Digimon gets +3000 DP for the turn.",
            kind: "ModifyDP",
            target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            amount: 3000,
            duration: "forTheTurn",
          },
        ],
      },
      { trigger: "Security", actions: [{ kind: "GainMemory", amount: 2 }], isSecurity: true },
    ]);

    expect(card("BT2-108")?.effects).toMatchObject([
      {
        trigger: "Main",
        actions: [
          {
            kind: "PlayWithoutCost",
            target: { filter: { controller: "mine", kind: ["Digimon"], colors: ["Purple"], levels: [3] }, count: 1 },
            from: ["trash"],
            payCost: false,
            suppressOnPlayEffects: true,
          },
        ],
      },
      { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
    ]);

    expect(card("BT2-109")?.effects).toMatchObject([
      {
        trigger: "Main",
        actions: [
          {
            kind: "Delete",
            target: {
              filter: { controller: "opponent", kind: ["Digimon"], levelComparison: { op: "lte", value: 4 } },
              count: 2,
              upTo: true,
            },
            cost: { kind: "deleteOwn", target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 } },
            optional: true,
          },
        ],
      },
      { trigger: "Security", actions: [{ kind: "AddToHandSelf" }], isSecurity: true },
    ]);

    expect(card("BT2-110")?.effects).toEqual([
      {
        trigger: "Main",
        actions: [
          {
            effectTextPart: "[Main] Delete 1 of your opponent's unsuspended Digimon.",
            kind: "Delete",
            target: { filter: { controller: "opponent", unsuspended: true, kind: ["Digimon"] }, count: 1 },
          },
        ],
      },
      { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
    ]);
  });
});
