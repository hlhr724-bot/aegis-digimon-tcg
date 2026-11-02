import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./EX2-071.js";
import "./EX2-039.js";
import "./EX2-044.js";
import "./EX2-071.js";

const inertDeck = ["BT1-009", "BT1-010", "BT1-011", "BT1-012"];
const inertSecurity = ["BT1-013", "BT1-014"];

describe("EX2-071 Death Slinger", () => {
  it("matches the catalog, Q3361, and typed IR", () => {
    expect(getCardDefinition("EX2-071")).toMatchObject({
      cardId: "EX2-071",
      nameEn: "Death Slinger",
      colors: ["Purple"],
      kinds: ["Option"],
      playCost: 4,
      dp: 0,
      evoCosts: [],
      rarity: "U",
      maxCountInDeck: 4,
      effectText:
        "When this card is trashed from your deck, gain 1 memory.[Main] Delete 1 of your opponent's level 4 or lower Digimon. For every 10 cards in your trash, add 1 to the maximum level of the Digimon you can choose with this effect.",
      securityEffectText: "[Security] Activate this card's [Main] effect.",
    });
    expect(compiled.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: "AllTurns",
          actions: [
            expect.objectContaining({
              kind: "SubTrigger",
              event: "whenTrashedFromDeck",
              sourceFilter: { isSelfRef: true },
              actions: [{ kind: "GainMemory", amount: 1 }],
            }),
          ],
        }),
        expect.objectContaining({
          trigger: "Main",
          actions: [
            {
              effectTextPart:
                "[Main] Delete 1 of your opponent's level 4 or lower Digimon. For every 10 cards in your trash, add 1 to the maximum level of the Digimon you can choose with this effect.",
              kind: "Delete",
              target: {
                filter: {
                  controller: "opponent",
                  kind: ["Digimon"],
                  levelComparison: {
                    op: "lte",
                    value: 4,
                    scaling: {
                      per: 10,
                      filter: { zone: "trash", controller: "mine" },
                      unit: "trash",
                    },
                  },
                },
                count: 1,
              },
            },
          ],
        }),
        expect.objectContaining({ trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true }),
      ]),
    );
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("deletes an opposing level-4-or-lower Digimon", async () => {
    const s = setupEngine(
      { 0: { battleArea: ["EX2-044"], hand: [{ card: "EX2-071", as: "option" }] }, 1: { battleArea: ["EX2-019"] } },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.memory).toBe(6);
  });

  it("raises the level boundary by one only after each complete ten cards in trash", async () => {
    const below = setupEngine(
      {
        0: {
          battleArea: ["EX2-044"],
          hand: [{ card: "EX2-071", as: "option" }],
          trash: Array.from({ length: 9 }, () => "BT1-009"),
        },
        1: { battleArea: [{ card: "EX2-023", as: "level5" }] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    below.state.memory = 10;
    expect(below.engine.applyIntent(0, { type: "playCard", instanceId: below.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      below.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX2-071"),
    );
    expect(below.state.players[1]!.battleArea).toHaveLength(1);

    const at = setupEngine(
      {
        0: {
          battleArea: ["EX2-044"],
          hand: [{ card: "EX2-071", as: "option" }],
          trash: Array.from({ length: 10 }, () => "BT1-009"),
        },
        1: { battleArea: [{ card: "EX2-023", as: "level5" }] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    at.state.memory = 10;
    expect(at.engine.applyIntent(0, { type: "playCard", instanceId: at.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => at.state.players[1]!.battleArea.length === 0);
    expect(at.state.players[1]!.battleArea).toHaveLength(0);

    const nineteen = setupEngine(
      {
        0: {
          battleArea: ["EX2-044"],
          hand: [{ card: "EX2-071", as: "option" }],
          trash: Array.from({ length: 19 }, () => "BT1-009"),
        },
        1: { battleArea: [{ card: "EX2-029", as: "level6" }] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    nineteen.state.memory = 10;
    expect(
      nineteen.engine.applyIntent(0, { type: "playCard", instanceId: nineteen.inst("option").instanceId }),
    ).toEqual({ ok: true });
    await settle(() =>
      nineteen.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX2-071"),
    );
    expect(nineteen.state.players[1]!.battleArea).toHaveLength(1);

    const twenty = setupEngine(
      {
        0: {
          battleArea: ["EX2-044"],
          hand: [{ card: "EX2-071", as: "option" }],
          trash: Array.from({ length: 20 }, () => "BT1-009"),
        },
        1: { battleArea: [{ card: "EX2-029", as: "level6" }] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    twenty.state.memory = 10;
    expect(twenty.engine.applyIntent(0, { type: "playCard", instanceId: twenty.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => twenty.state.players[1]!.battleArea.length === 0);
    expect(twenty.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("gains 1 memory when an EX2-071 is directly trashed from the deck", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX2-044", as: "miller" }], deck: [{ card: "EX2-071", as: "trashed" }, "BT1-009"] },
        1: { security: ["BT1-013"] },
      },
      { autoAcceptOptional: true, autoOrderTriggers: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("miller").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("trashed").instanceId) &&
        s.state.memory === 4,
    );
    expect(s.state.memory).toBe(4);
  });

  it("does not gain memory when EX2-071 is only revealed from the deck (Q3361)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX2-039", as: "revealer" }],
          deck: [
            { card: "EX2-071", as: "revealed" },
            { card: "BT1-009", as: "bottomOne" },
            { card: "BT1-010", as: "bottomTwo" },
            { card: "BT1-011", as: "bottomThree" },
            { card: "BT1-012", as: "tail" },
          ],
          security: inertSecurity,
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("revealer").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX2-039") &&
        s.state.players[0]!.deck.some((card) => card.instanceId === s.inst("revealed").instanceId),
    );
    expect(s.state.memory).toBe(7);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toContain(s.inst("revealed").instanceId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).not.toContain(s.inst("revealed").instanceId);
  });

  it("activates its Main effect from Security through a public attack", async () => {
    const s = setupEngine(
      {
        0: {
          deck: inertDeck,
          security: [{ card: "EX2-071", as: "securityOption" }, ...inertSecurity],
        },
        1: {
          battleArea: [
            { card: "EX2-050", as: "attacker" },
            { card: "EX2-019", as: "target" },
          ],
          deck: inertDeck,
          security: inertSecurity,
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 3;
    const turnLoop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !observe(s.engine).isAttacking() && !s.state.players[1]!.battleArea.some((p) => p.topCard.cardId === "EX2-019"),
    );
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard.cardId === "EX2-019")).toBe(false);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await turnLoop;
  });
});
