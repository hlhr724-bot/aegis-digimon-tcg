import { describe, expect, it } from "vitest";
import { hasRegisteredCompiledCard, runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import "./BT4-021.js";
import "./BT4-022.js";
import "./BT4-023.js";
import "./BT4-024.js";
import "./BT4-025.js";
import "./BT4-026.js";
import "./BT4-027.js";
import "./BT4-028.js";
import "./BT4-029.js";
import "./BT4-030.js";

const CARD_IDS = [
  "BT4-021",
  "BT4-022",
  "BT4-023",
  "BT4-024",
  "BT4-025",
  "BT4-026",
  "BT4-027",
  "BT4-028",
  "BT4-029",
  "BT4-030",
] as const;

const card = (cardId: string) => runtimeCompiledCard(cardId);

describe("BT4-021 through BT4-030 IR coverage", () => {
  it("registers every card through complete compiled IR", () => {
    for (const cardId of CARD_IDS) {
      expect(hasRegisteredCompiledCard(cardId), `${cardId} direct compiled registration`).toBe(true);
      expect(card(cardId), `${cardId} runtime IR`).toMatchObject({ coverage: "full", residual: [] });
    }
  });

  it("preserves the range's trigger, target, cost, and keyword boundaries", () => {
    expect(card("BT4-021")?.effects[0]).toMatchObject({
      trigger: "YourTurn",
      isInherited: true,
      actions: [
        {
          kind: "SubTrigger",
          event: "onDigiBurstCardDiscarded",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "Return",
              target: { filter: { isSelfRef: true, zone: "trash" }, count: 1 },
              to: "hand",
            },
          ],
        },
      ],
    });

    expect(card("BT4-022")?.effects).toEqual([]);
    expect(card("BT4-023")?.effects[0]).toMatchObject({
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: expect.arrayContaining([
            {
              effectTextPart: "Add 1 Digimon card with [Hybrid] in its form",
              count: 1,
              to: "hand",
              filter: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Hybrid"], match: "trait" }],
              },
            },
            {
              effectTextPart: "1 blue Tamer card among them to your hand.",
              count: 1,
              to: "hand",
              filter: { controllerDefault: "mine", kind: ["Tamer"], colors: ["Blue"] },
            },
          ]),
          rest: "deckBottom",
        },
      ],
    });

    expect(card("BT4-024")?.effects).toEqual([]);
    expect(card("BT4-025")?.effects[0]).toMatchObject({
      trigger: "Static",
      actions: [
        {
          kind: "TamerOntoDigivolve",
          from: ["hand"],
          asLevel: 3,
          onto: { controller: "mine", kind: ["Tamer"], colors: ["Blue"] },
        },
      ],
    });
    expect(card("BT4-026")?.effects[0]).toMatchObject({
      trigger: "Main",
      actions: [
        {
          kind: "Draw",
          amount: 1,
          cost: {
            kind: "trash",
            target: { filter: { isSelfRef: true, zone: "digivolutionCards" }, count: 2 },
            raw: "＜Digi-Burst 2＞",
          },
        },
      ],
    });
    expect(card("BT4-026")?.effects[0]?.actions).toHaveLength(1);

    expect(card("BT4-027")?.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "Return",
              target: { filter: { controller: "opponent", kind: ["Digimon"], levels: [3] }, count: 1 },
              to: "hand",
            },
          ],
        }),
      ]),
    );
    expect(card("BT4-027")?.digivolutionRequirement).toEqual([
      { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Blue"] },
    ]);

    expect(card("BT4-028")?.effects[0]).toMatchObject({
      trigger: "WhenAttacking",
      isInherited: true,
      actions: [
        {
          kind: "TrashDigivolution",
          amount: 1,
          fromTop: true,
          target: { filter: { controller: "opponent", kind: ["Digimon"], digivolutionCards: "hasAny" }, count: 1 },
        },
      ],
    });
    expect(card("BT4-029")?.effects).toEqual([]);
    expect(card("BT4-030")?.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: "Static",
          keywords: expect.arrayContaining([expect.objectContaining({ keyword: "Jamming" })]),
        }),
        expect.objectContaining({
          trigger: "Static",
          actions: [
            expect.objectContaining({
              kind: "Restrict",
              restriction: "cantBeAttacked",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              condition: {
                kind: "allOf",
                conditions: [
                  { kind: "isOpponentsTurn" },
                  {
                    kind: "anyOf",
                    conditions: [
                      {
                        kind: "selfDigivolutionStackCountAtLeast",
                        count: 1,
                        filter: { kind: ["Digimon"], nameOrTrait: [{ tokens: ["Hybrid"], match: "trait" }] },
                      },
                      {
                        kind: "selfDigivolutionStackCountAtLeast",
                        count: 1,
                        filter: { kind: ["Tamer"], colors: ["Blue"] },
                      },
                    ],
                  },
                ],
              },
            }),
          ],
        }),
      ]),
    );
  });
});
