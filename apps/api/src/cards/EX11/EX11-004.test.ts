import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle, settleAcrossTimers } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";

describe("EX11-004 Kapurimon", () => {
  it("encodes the inherited once-per-turn opponent-security watcher", () => {
    const compiled = runtimeCompiledCard("EX11-004")!;
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
        trigger: "YourTurn",
        isInherited: true,
        frequency: "OncePerTurn",
        actions: [
          {
            kind: "SubTrigger",
            event: "whenFaceUpCardsAddedToOpponentSecurity",
            actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
          },
        ],
      }),
    );
  });

  it("draws when an effect flips the opponent's face-down security card face up (Q5789)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX11-039", as: "host", under: ["EX11-004"] }],
        hand: [{ card: "EX11-064", as: "altea" }],
        deck: [{ card: "BT1-009", as: "drawn" }],
      },
      1: { security: [{ card: "BT1-010", as: "flipped", faceUp: false }] },
    });
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("altea").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId));

    expect(s.state.players[1]!.security[0]).toMatchObject({ instanceId: s.inst("flipped").instanceId, faceUp: true });
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("drawn").instanceId);
    assertNoLoudGap(s);
  });

  it("does not draw when an attack checks the opponent's face-down security card (CR 13-1-6)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX11-037", as: "host", under: ["EX11-004"] }],
        deck: [{ card: "BT1-009", as: "deckTop" }],
      },
      1: { security: [{ card: "BT1-009", as: "checked", faceUp: false }] },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "securityChecked"));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toContain(s.inst("deckTop").instanceId);
    assertNoLoudGap(s);
  });

  it("does not draw from a public face-up placement in its controller's own security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX11-037", as: "host", under: ["EX11-004"] },
            { card: "EX11-025", as: "funbeemon" },
          ],
          security: [{ card: "BT1-009", as: "top" }],
          hand: [{ card: "EX11-030", as: "royalBase" }],
          deck: [{ card: "BT1-010", as: "deckTop" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await settle();

    expect(s.state.players[0]!.security.at(-1)).toMatchObject({ cardId: "EX11-030", faceUp: true });
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toContain(s.inst("deckTop").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT1-009");
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await turn;
    assertNoLoudGap(s);
  });

  it("does not treat checking an already-face-up security card as a new add", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX11-037", as: "host", under: ["EX11-004"] }],
        deck: [{ card: "BT1-009", as: "deckTop" }],
      },
      1: { security: [{ card: "BT1-009", faceUp: true }] },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.gameOver !== undefined);

    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toContain(s.inst("deckTop").instanceId);
    assertNoLoudGap(s);
  });
});

describe("EX11-004 Kapurimon — KB Q&A rulings", () => {
  it("draws when the opponent's effect places a face-up card in their security during its turn (Q5790)", async () => {
    const deck = ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"];
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT23-043", as: "base" },
            { card: "BT1-009", as: "defender" },
          ],
          hand: [{ card: "BT23-045", as: "tiger" }],
          trash: [{ card: "BT18-044", as: "royalTrash" }],
          security: ["BT1-010", "BT1-011"],
          deck,
        },
        1: {
          battleArea: [
            { card: "EX11-037", as: "attacker", under: ["EX11-004"], dp: 20_000 },
            { card: "BT1-009", as: "returned" },
          ],
          security: ["BT1-009", "BT1-010"],
          deck,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("returned").permanentId, s.perm("returned").topCard.instanceId);
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    await advance(s.engine).verb.suspend([s.perm("defender").permanentId]);
    const deckBefore = s.state.players[1]!.deck.length;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).isAttacking());
    expect(
      s.engine.applyIntent(0, {
        type: "respondCounter",
        sourceInstanceId: s.inst("tiger").instanceId,
        effectKey: `blast-digivolve:${s.perm("base").permanentId}`,
      } as never),
    ).toEqual({ ok: true });
    await settleAcrossTimers(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.security.at(-1)).toMatchObject({
      instanceId: s.inst("royalTrash").instanceId,
      faceUp: true,
    });
    expect(s.state.players[1]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("returned").instanceId);
    expect(s.perm("attacker").topCard.cardId).toBe("EX11-037");
    expect(s.state.players[1]!.deck).toHaveLength(deckBefore - 1);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
