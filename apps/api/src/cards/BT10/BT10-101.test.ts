import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "./BT10-101.js";

describe("BT10-101 Lónkhē Adistakto", () => {
  it("at exactly 3 security, deletes one Digimon by DP and places another into security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT10-029"],
          security: ["BT1-001", "BT1-002", "BT1-003"],
          hand: [{ card: "BT10-101", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "BT10-086", as: "dpTarget" },
            { card: "BT1-010", as: "securityTarget" },
          ],
        },
      },
      { autoOrderTriggers: true },
    );
    const dpTargetPermanentId = s.perm("dpTarget").permanentId;
    const securityTargetPermanentId = s.perm("securityTarget").permanentId;
    const securityTargetId = s.perm("securityTarget").topCard.instanceId;
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.decisions.filter(({ req }) => req.kind === "chooseTargets").length === 1);
    const dpDecision = s.decisions.find(({ req }) => req.kind === "chooseTargets")!.req;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: dpDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [dpTargetPermanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.decisions.filter(({ req }) => req.kind === "chooseTargets").length === 2);
    const securityDecision = s.decisions.filter(({ req }) => req.kind === "chooseTargets")[1]!.req;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: securityDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [securityTargetPermanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1);

    expect(s.perm("dpTarget").currentDP).toBe(4000);
    expect(s.state.players[1]!.security.at(-1)?.instanceId).toBe(securityTargetId);
    expect(s.state.players[1]!.security.at(-1)?.faceUp).toBe(false);
  });

  it("with 4 security, applies only the DP reduction", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT10-029"],
          security: ["BT1-001", "BT1-002", "BT1-003", "BT1-004"],
          hand: [{ card: "BT10-101", as: "option" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    const targetId = s.perm("target").topCard.instanceId;
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === targetId));

    expect(s.state.players[1]!.security).toHaveLength(0);
  });

  it("with 2 security, applies only the security placement", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT10-029"],
          security: ["BT1-001", "BT1-002"],
          hand: [{ card: "BT10-101", as: "option" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    const targetId = s.perm("target").topCard.instanceId;
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.security.some((card) => card.instanceId === targetId));

    expect(s.state.players[1]!.trash.some((card) => card.instanceId === targetId)).toBe(false);
  });

  it("waives its color requirement when Pulsemon is in a Digimon's sources", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-010", under: ["BT10-031"] }],
        hand: [{ card: "BT10-101", as: "option" }],
      },
    });
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
  });

  it("does not waive its color requirement when Pulsemon is under a Tamer", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-089", under: ["BT10-031"] }],
        hand: [{ card: "BT10-101", as: "option" }],
      },
    });
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("option").instanceId,
      }).ok,
    ).toBe(false);
  });

  it("Security activates the same Main effect", async () => {
    const s = setupEngine(
      {
        0: {
          security: ["BT1-001", "BT1-002", "BT1-003", "BT1-004", { card: "BT10-101", as: "option", faceUp: true }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    const targetId = s.perm("target").topCard.instanceId;

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === targetId));

    expect(s.state.players[1]!.trash.some((card) => card.instanceId === targetId)).toBe(true);
  });
});

describe("BT10-101 Lónkhē Adistakto — KB Q&A rulings", () => {
  type Setup = ReturnType<typeof setupEngine>;

  async function chooseTarget(s: Setup, seat: 0 | 1, decisionIndex: number, permanentId: string) {
    await settle(() => s.decisions.filter(({ req }) => req.kind === "chooseTargets").length === decisionIndex + 1);
    const decision = s.decisions.filter(({ req }) => req.kind === "chooseTargets")[decisionIndex]!;
    expect(decision.seat).toBe(seat);
    expect(
      s.engine.applyIntent(seat, {
        type: "respondDecision",
        decisionId: decision.req.decisionId,
        response: { kind: "chooseTargets", instanceIds: [permanentId] },
      }),
    ).toEqual({ ok: true });
  }

  it("activates both the -12000 DP and the place-in-security effects with exactly 3 security cards (Q2035)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT10-029"],
          security: ["BT1-001", "BT1-002", "BT1-003"],
          hand: [{ card: "BT10-101", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "BT10-086", as: "dpTarget" },
            { card: "BT1-010", as: "securityTarget" },
          ],
        },
      },
      { autoOrderTriggers: true },
    );
    const securityTargetCardId = s.perm("securityTarget").topCard.instanceId;
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await chooseTarget(s, 0, 0, s.perm("dpTarget").permanentId);
    await chooseTarget(s, 0, 1, s.perm("securityTarget").permanentId);
    await settle(() => s.state.players[1]!.security.length === 1);

    expect(s.perm("dpTarget").currentDP).toBe(16000 - 12000);
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([securityTargetCardId]);
    expect(s.state.players[1]!.security[0]!.faceUp).toBe(false);

    const withFourSecurity = setupEngine(
      {
        0: {
          battleArea: ["BT10-029"],
          security: ["BT1-001", "BT1-002", "BT1-003", "BT1-004"],
          hand: [{ card: "BT10-101", as: "option" }],
        },
        1: { battleArea: [{ card: "BT10-086", as: "dpTarget" }, "BT1-010"] },
      },
      { autoOrderTriggers: true },
    );
    withFourSecurity.state.memory = 10;
    expect(
      withFourSecurity.engine.applyIntent(0, {
        type: "playCard",
        instanceId: withFourSecurity.inst("option").instanceId,
      }),
    ).toEqual({ ok: true });
    await chooseTarget(withFourSecurity, 0, 0, withFourSecurity.perm("dpTarget").permanentId);
    await settle(() => withFourSecurity.perm("dpTarget").currentDP === 4000);
    await settle();

    expect(withFourSecurity.decisions.filter(({ req }) => req.kind === "chooseTargets")).toHaveLength(1);
    expect(withFourSecurity.state.players[1]!.security).toHaveLength(0);
  });

  it("counts a 4-card security stack as 3 once this card is revealed by a security check (Q2036)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-010", as: "attacker" },
            { card: "BT10-086", as: "bystander" },
          ],
        },
        1: {
          battleArea: ["BT10-029"],
          security: [{ card: "BT10-101", as: "option" }, "BT1-001", "BT1-002", "BT1-003"],
        },
      },
      { autoOrderTriggers: true },
    );
    const attackerCardId = s.perm("attacker").topCard.instanceId;
    const bystanderCardId = s.perm("bystander").topCard.instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await chooseTarget(s, 1, 0, s.perm("attacker").permanentId);
    await chooseTarget(s, 1, 1, s.perm("bystander").permanentId);
    await settle(() => s.state.players[0]!.security.length === 1);

    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === attackerCardId)).toBe(true);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([bystanderCardId]);
  });
});
