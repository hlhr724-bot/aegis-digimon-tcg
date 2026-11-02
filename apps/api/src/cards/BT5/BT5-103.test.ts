import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../BT1/BT1-026.js";
import "./BT5-103.js";

describe("BT5-103 A Blazing Storm of Metal!", () => {
  it("gives every Reboot Digimon +1000 DP and Blocker", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT5-068", as: "first" },
            { card: "BT5-070", as: "second" },
            { card: "BT5-071", as: "normal" },
          ],
          hand: [{ card: "BT5-103", as: "option" }],
        },
        1: { battleArea: [{ card: "BT5-068", as: "opponent" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        observe(s.engine).hasKeyword(s.perm("first"), "Blocker") &&
        observe(s.engine).hasKeyword(s.perm("second"), "Blocker"),
    );
    expect(s.perm("first").currentDP).toBe(s.perm("first").baseDP + 1000);
    expect(JSON.parse(s.state.players[0]!.fieldEffectsJson)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "dp",
          sourceCardId: "BT5-103",
          effectText: "All of your Digimon with ＜Reboot＞ get +1000 DP.",
        }),
        expect.objectContaining({
          kind: "keyword",
          value: "Blocker",
          sourceCardId: "BT5-103",
          effectText: "All of your Digimon with ＜Reboot＞ gain ＜Blocker＞.",
        }),
      ]),
    );
    expect(s.perm("second").currentDP).toBe(s.perm("second").baseDP + 1000);
    expect(s.perm("normal").currentDP).toBe(s.perm("normal").baseDP);
    expect(s.perm("opponent").currentDP).toBe(s.perm("opponent").baseDP);
    // CR 15-11-2-2: a Digimon that enters afterwards is affected too.
    const lateEntrant = s.putOnBoard(0, "BT5-068");
    await advance(s.engine).recompute();
    expect(lateEntrant.currentDP - lateEntrant.baseDP).toBe(s.perm("first").currentDP - s.perm("first").baseDP);
    expect(observe(s.engine).hasKeyword(s.perm("normal"), "Blocker")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("opponent"), "Blocker")).toBe(false);
    // CR 15-11-2-2: a Digimon that enters afterwards gains it too.
    const lateKeywordEntrant0 = s.putOnBoard(0, "BT5-068");
    expect(observe(s.engine).hasKeyword(lateKeywordEntrant0, "Blocker")).toBe(true);
    advance(s.engine).ledgers.modifiers.sweep(s.state, "ownerTurnEnd", 0);
    advance(s.engine).ledgers.continuous.sweep(s.state, "ownerTurnEnd", 0);
    await advance(s.engine).recompute();
    expect(s.perm("first").currentDP).toBe(s.perm("first").baseDP + 1000);
    expect(observe(s.engine).hasKeyword(s.perm("first"), "Blocker")).toBe(true);
    advance(s.engine).ledgers.modifiers.sweep(s.state, "opponentTurnEnd", 1);
    advance(s.engine).ledgers.continuous.sweep(s.state, "opponentTurnEnd", 1);
    await advance(s.engine).recompute();
    expect(s.perm("first").currentDP).toBe(s.perm("first").baseDP);
    expect(observe(s.engine).hasKeyword(s.perm("first"), "Blocker")).toBe(false);
  });

  it("gives later-played Reboot Digimon +1000 DP and Blocker but not later-played non-Reboot Digimon (Discord 1555352172206493706)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT5-068", as: "first" }],
          hand: [
            { card: "BT5-103", as: "option" },
            { card: "BT5-070", as: "laterReboot" },
            { card: "BT5-071", as: "laterNormal" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).hasKeyword(s.perm("first"), "Blocker"));

    await advance(s.engine).verb.playInstances([s.inst("laterReboot").instanceId, s.inst("laterNormal").instanceId]);

    expect(s.perm("laterReboot").currentDP).toBe(s.perm("laterReboot").baseDP + 1000);
    expect(observe(s.engine).hasKeyword(s.perm("laterReboot"), "Blocker")).toBe(true);
    expect(s.perm("laterNormal").currentDP).toBe(s.perm("laterNormal").baseDP);
    expect(observe(s.engine).hasKeyword(s.perm("laterNormal"), "Blocker")).toBe(false);
  });

  it("security prevents opposing Digimon from attacking players and adds itself to hand", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: "BT5-103", as: "securityOption", faceUp: true }],
        battleArea: [{ card: "BT5-047", as: "ownTarget" }],
      },
      1: { battleArea: [{ card: "BT5-047", as: "target" }] },
    });
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityOption"));
    expect(observe(s.engine).isRestricted(s.perm("target"), "attackPlayers")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("target"), "attack")).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("ownTarget"), "attackPlayers")).toBe(false);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("securityOption").instanceId);
    advance(s.engine).ledgers.continuous.sweep(s.state, "eachTurnEnd", 1);
    expect(observe(s.engine).isRestricted(s.perm("target"), "attackPlayers")).toBe(false);
  });
});

describe("BT5-103 A Blazing Storm of Metal! — overall processing", () => {
  it("CR 15-11-2-2: Security also stops a Digimon that entered after the security check", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      1: { security: [{ card: "BT5-103", as: "blazingStorm" }, "BT1-010"] },
    });
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.hand.some(({ instanceId }) => instanceId === s.inst("blazingStorm").instanceId) &&
        !observe(s.engine).isAttacking(),
    );
    const late = s.putOnBoard(0, "BT1-010");

    expect(observe(s.engine).isRestricted(late, "attackPlayers")).toBe(true);
  });
});

describe("BT5-103 A Blazing Storm of Metal! — KB Q&A rulings", () => {
  it("still lets a Piercing Digimon that deletes a Digimon in battle check security after the [Security] effect (Q1376)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT1-009", as: "firstAttacker" },
          { card: "BT1-026", as: "piercer" },
        ],
      },
      1: {
        battleArea: [{ card: "BT1-009", as: "defender", suspended: true }],
        security: [
          { card: "BT5-103", as: "blazingStorm" },
          { card: "BT1-010", as: "checked" },
        ],
      },
    });
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("firstAttacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.hand.some(({ instanceId }) => instanceId === s.inst("blazingStorm").instanceId) &&
        !observe(s.engine).isAttacking(),
    );
    expect(observe(s.engine).isRestricted(s.perm("piercer"), "attackPlayers")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("piercer").permanentId,
        target: { kind: "player" },
      }).ok,
    ).toBe(false);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("piercer").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0 && !observe(s.engine).isAttacking());

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("checked").instanceId);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("piercer").permanentId,
    );
  });
});
