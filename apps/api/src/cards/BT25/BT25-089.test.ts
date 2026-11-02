import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../index.js";

interface ActivatableEntry {
  instanceId: string;
  effectKey: string;
}

function activatableEffects(
  s: ReturnType<typeof setupEngine>,
  permanent: { activatableEffectsJson?: string },
): ActivatableEntry[] {
  (s.engine as unknown as { projection: { syncActivatableEffects(): void } }).projection.syncActivatableEffects();
  return permanent.activatableEffectsJson ? (JSON.parse(permanent.activatableEffectsJson) as ActivatableEntry[]) : [];
}

describe("BT25-089 Kazuki & Itsuki", () => {
  it("gains exactly 1 memory at start main only when the opponent has a battle-area Digimon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT25-089", as: "tamer" }] },
      1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
    });
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("tamer"));
    expect(s.state.memory).toBe(1);

    const noOpponent = setupEngine({ 0: { battleArea: [{ card: "BT25-089", as: "tamer" }] } });
    await noOpponent.ready();
    await advance(noOpponent.engine).fire(EffectTiming.OnStartMainPhase, noOpponent.perm("tamer"));
    expect(noOpponent.state.memory).toBe(0);
  });

  it("suspends itself, pays link cost reduced by 2, and links an Appmon from hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-089", as: "tamer" },
            { card: "BT21-009", as: "host" },
          ],
          hand: [{ card: "BT26-010", as: "link" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnDeclaration, s.perm("tamer"));

    expect(s.perm("tamer").isSuspended).toBe(true);
    expect(s.perm("host").linked.map((card) => card.instanceId)).toContain(s.inst("link").instanceId);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.memory).toBe(2);
  });

  it("links an Appmon from a battle-area Digimon's sources while preserving breeding sources", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-089", as: "tamer" },
            { card: "BT21-009", as: "host", under: [{ card: "BT26-010", as: "material" }] },
          ],
          breeding: { card: "BT21-009", as: "breeding", under: [{ card: "BT26-010", as: "breedingSource" }] },
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    const effect = activatableEffects(s, s.perm("tamer"))[0]!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: effect.instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("host").linked.map((card) => card.instanceId)).toEqual([s.inst("material").instanceId]);
    expect(s.perm("host").stack).toHaveLength(0);
    expect(s.perm("breeding").stack.map((card) => card.instanceId)).toEqual([s.inst("breedingSource").instanceId]);
    expect(s.perm("tamer").isSuspended).toBe(true);
    expect(s.state.memory).toBe(2);
  });

  it("does not link digivolution cards from breeding or from under a Tamer", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT25-089", as: "tamer", under: [{ card: "BT26-010", as: "tamerSource" }] },
          { card: "BT21-009", as: "host" },
        ],
        breeding: { card: "BT21-009", as: "breeding", under: [{ card: "BT26-010", as: "breedingSource" }] },
      },
    });
    await s.ready();
    expect(activatableEffects(s, s.perm("tamer"))).toEqual([]);
    expect(s.perm("breeding").stack.map((card) => card.instanceId)).toContain(s.inst("breedingSource").instanceId);
    expect(s.perm("host").linked).toHaveLength(0);
  });

  it("Q6423 rejects a second copy's Main activation while the first link activation is pending", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-089", as: "first" },
            { card: "BT25-089", as: "second" },
            { card: "BT21-009", as: "host" },
          ],
          hand: [{ card: "BT26-010", as: "link" }],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    const first = activatableEffects(s, s.perm("first"))[0]!;
    const second = activatableEffects(s, s.perm("second"))[0]!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: first.instanceId,
        effectKey: first.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: second.instanceId,
        effectKey: second.effectKey,
      }),
    ).toEqual({ ok: false, reason: "decision-pending" });
    expect(s.perm("second").isSuspended).toBe(false);

    const pending = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").linked.some((card) => card.instanceId === s.inst("link").instanceId));

    expect(s.perm("first").isSuspended).toBe(true);
    expect(s.perm("second").isSuspended).toBe(false);
    expect(s.state.memory).toBe(2);
  });

  it("does not offer an Appmon card without its own Link requirement (Q6422)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-089", as: "tamer" },
            { card: "BT21-009", as: "host" },
          ],
          hand: [{ card: "BT21-005", as: "noLink" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(s.perm("tamer").activatableEffectsJson).toBe("");
    expect(s.perm("tamer").isSuspended).toBe(false);
    expect(s.perm("host").linked).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("noLink").instanceId);
  });

  it("app fuses a legal host at end of turn and carries the old top under the result", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-089", as: "tamer" },
            { card: "BT25-070", as: "host", linked: [{ card: "BT21-059", as: "timemon" }] },
          ],
          hand: [{ card: "BT25-072", as: "result" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnEndTurn, s.perm("tamer"));
    expect(s.perm("host").topCard.instanceId).toBe(s.inst("result").instanceId);
    expect([...s.perm("host").stack, ...s.perm("host").linked].map((card) => card.cardId)).toContain("BT25-070");
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it("does not app fuse when the host lacks the target's second required Appmon name", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-089", as: "tamer" },
            { card: "BT25-070", as: "host", linked: [{ card: "BT23-016" }] },
          ],
          hand: [{ card: "BT25-072", as: "result" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnEndTurn, s.perm("tamer"));
    expect(s.perm("host").topCard.cardId).toBe("BT25-070");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("result").instanceId);
  });

  it("can decline the optional App Fusion even when a legal result is available", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-089", as: "tamer" },
            { card: "BT25-070", as: "host", linked: [{ card: "BT21-059", as: "timemon" }] },
          ],
          hand: [{ card: "BT25-072", as: "result" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnEndTurn, s.perm("tamer"));

    expect(s.perm("host").topCard.cardId).toBe("BT25-070");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("result").instanceId);
  });

  it("only app fuses a result from its controller's hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-089", as: "tamer" },
            { card: "BT25-070", as: "host", linked: [{ card: "BT21-059", as: "timemon" }] },
          ],
        },
        1: { hand: [{ card: "BT25-072", as: "opponentResult" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnEndTurn, s.perm("tamer"));

    expect(s.perm("host").topCard.cardId).toBe("BT25-070");
    expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toContain(s.inst("opponentResult").instanceId);
  });

  it("plays itself for free from Security", async () => {
    const s = setupEngine({
      0: { security: [{ card: "BT25-089", as: "tamer" }] },
      1: { battleArea: [{ card: "AD1-001", as: "attacker", dp: 20000 }] },
    });
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("tamer").instanceId),
    );
    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("tamer").instanceId),
    ).toBe(true);
  });
});
