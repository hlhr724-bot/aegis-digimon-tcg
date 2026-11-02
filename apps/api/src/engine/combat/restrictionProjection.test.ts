import { describe, it, expect } from "vitest";
import { EffectDuration, type PlayerState } from "@aegis/shared";
import { makeDigimon as digimon, setupEngine as setup } from "../testkit/harness.js";
import { internalsOf } from "../testkit/internals.js";
import "../../cards/index.js";

/**
 * `Permanent.cannotAttack` / `cannotBlock` / `securityAttack` are the server's answers to
 * "what may this position do in combat right now?", published so the client can pulse an
 * imposed lock and read out a truthful security-check count without rebuilding either rule.
 *
 * Every assertion drives the projection through `recomputeContinuousEffects`, the one pass
 * that owns it, and through the same ledger writers the card effects themselves use — so a
 * projection that stopped agreeing with the rules fails here.
 */

const VANILLA_CARD = "AD1-001"; // no keywords

describe("Permanent combat-restriction projection", () => {
  it("publishes stacked-card protections only while UlforceVeedramon is unsuspended", async () => {
    const s = setup({
      0: { battleArea: [{ card: "EX13-023", as: "ulforce", under: ["EX13-022", "EX13-019", "EX13-016"] }] },
      1: { battleArea: [{ card: VANILLA_CARD, as: "other" }] },
    });
    await s.ready();
    for (const isSuspended of [false, true, false]) {
      s.perm("ulforce").isSuspended = isSuspended;
      await s.engine.recomputeContinuousEffects();
      expect(s.perm("ulforce")).toMatchObject({
        protectedFromStackTrash: !isSuspended,
        protectedFromStackReturn: !isSuspended,
        protectedFromEffectReturn: false,
      });
      expect(s.perm("other")).toMatchObject({
        protectedFromStackTrash: false,
        protectedFromStackReturn: false,
      });
    }
  });

  it("publishes battle protection separately from opponent effect deletion protection and expires it", async () => {
    const s = setup();
    const permanent = digimon(0, 5000, VANILLA_CARD);
    s.state.players[0]!.battleArea.push(permanent);
    const { continuous } = internalsOf(s.engine);
    continuous.addRestriction(permanent.permanentId, "beDeleted", EffectDuration.Permanent, {
      byOpponentEffectsOnly: true,
    });
    await s.engine.recomputeContinuousEffects();
    expect(permanent.protectedFromEffectDeletion).toBe(true);
    expect(permanent.protectedFromBattleDeletion).toBe(false);
    continuous.addRestriction(permanent.permanentId, "beDeletedInBattle", EffectDuration.UntilEachTurnEnd);
    await s.engine.recomputeContinuousEffects();
    expect(permanent.protectedFromBattleDeletion).toBe(true);
    continuous.sweep(s.state, "eachTurnEnd", 0);
    await s.engine.recomputeContinuousEffects();
    expect(permanent.protectedFromBattleDeletion).toBe(false);
    continuous.addRestriction(permanent.permanentId, "beDeleted", EffectDuration.Permanent);
    await s.engine.recomputeContinuousEffects();
    expect(permanent.protectedFromBattleDeletion).toBe(true);
  });

  it.each([
    ["immuneToOpponentOptionEffects", "beAffected", "Option"],
    ["immuneToOpponentTamerEffects", "beAffected", "Tamer"],
    ["protectedFromDpReduction", "dpImmune", undefined],
    ["protectedFromDeDigivolve", "cantBeDeDigivolved", undefined],
    ["protectedFromEffectDeletion", "beDeleted", undefined],
    ["protectedFromEffectReturn", "beReturned", undefined],
  ] as const)(
    "projects active %s without treating a source-qualified protection as universal",
    async (field, restriction, sourceKind) => {
      const s = setup();
      const perm = digimon(0, 5000, VANILLA_CARD);
      s.state.players[0]!.battleArea.push(perm);
      const { continuous } = internalsOf(s.engine);
      await s.engine.recomputeContinuousEffects();
      expect(perm[field]).toBe(false);
      continuous.addRestriction(perm.permanentId, restriction, EffectDuration.UntilEachTurnEnd, {
        byOpponentEffectsOnly: true,
        ...(sourceKind ? { fromSourceKind: [sourceKind] } : {}),
      });
      await s.engine.recomputeContinuousEffects();
      expect(perm[field]).toBe(true);
      continuous.sweep(s.state, "eachTurnEnd", 0);
      await s.engine.recomputeContinuousEffects();
      expect(perm[field]).toBe(false);
    },
  );
  it("projects opposing Digimon effect immunity and removes it at its turn-end boundary", async () => {
    const s = setup();
    const perm = digimon(0, 5000, VANILLA_CARD);
    s.state.players[0]!.battleArea.push(perm);
    const { continuous } = internalsOf(s.engine);
    continuous.addRestriction(perm.permanentId, "beAffected", EffectDuration.UntilOpponentTurnEnd, {
      fromSourceKind: ["Digimon"],
      byOpponentEffectsOnly: true,
    });
    await s.engine.recomputeContinuousEffects();
    expect(perm.immuneToOpponentDigimonEffects).toBe(true);
    continuous.sweep(s.state, "ownerTurnEnd", 0);
    await s.engine.recomputeContinuousEffects();
    expect(perm.immuneToOpponentDigimonEffects).toBe(true);
    continuous.sweep(s.state, "opponentTurnEnd", 1);
    await s.engine.recomputeContinuousEffects();
    expect(perm.immuneToOpponentDigimonEffects).toBe(false);
    continuous.addRestriction(perm.permanentId, "beAffected", EffectDuration.Permanent, {
      fromSourceKind: ["Option"],
      byOpponentEffectsOnly: true,
    });
    await s.engine.recomputeContinuousEffects();
    expect(perm.immuneToOpponentDigimonEffects).toBe(false);
  });
  it("publishes an imposed attack lock, and clears it when the restriction lapses", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const perm = digimon(0, 5000, VANILLA_CARD);
    p0.battleArea.push(perm);
    const { continuous } = internalsOf(s.engine);

    await s.engine.recomputeContinuousEffects();
    expect(perm.cannotAttack).toBe(false);

    continuous.addRestriction(perm.permanentId, "attack", EffectDuration.UntilEachTurnEnd);
    await s.engine.recomputeContinuousEffects();
    expect(perm.cannotAttack).toBe(true);
    // A block lock is a separate question and must not ride along.
    expect(perm.cannotBlock).toBe(false);
  });

  it("publishes an imposed block lock on its own", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const perm = digimon(0, 5000, VANILLA_CARD);
    p0.battleArea.push(perm);
    internalsOf(s.engine).continuous.addRestriction(perm.permanentId, "block", EffectDuration.UntilEachTurnEnd);

    await s.engine.recomputeContinuousEffects();
    expect(perm.cannotBlock).toBe(true);
    expect(perm.cannotAttack).toBe(false);
  });

  it("stays false for summoning sickness, which is a different question entirely", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    s.state.turnCount = 1;
    const fresh = digimon(0, 5000, VANILLA_CARD);
    fresh.enterFieldTurnCount = s.state.turnCount;
    p0.battleArea.push(fresh);

    await s.engine.recomputeContinuousEffects();
    expect(fresh.summoningSick).toBe(true);
    expect(fresh.cannotAttack).toBe(false);
  });

  it("projects both seats, so a lock on the opponent's board is visible too", async () => {
    const s = setup();
    const p1 = s.state.players[1] as PlayerState;
    const theirs = digimon(1, 5000, VANILLA_CARD);
    p1.battleArea.push(theirs);
    internalsOf(s.engine).continuous.addRestriction(theirs.permanentId, "attack", EffectDuration.UntilEachTurnEnd);

    await s.engine.recomputeContinuousEffects();
    expect(theirs.cannotAttack).toBe(true);
  });
});

describe("Permanent non-combat restriction projection", () => {
  it("publishes the unsuspend lock the unsuspend step itself reads", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const perm = digimon(0, 5000, VANILLA_CARD);
    p0.battleArea.push(perm);
    const { continuous } = internalsOf(s.engine);

    await s.engine.recomputeContinuousEffects();
    expect(perm.cannotUnsuspend).toBe(false);

    continuous.addRestriction(perm.permanentId, "unsuspend", EffectDuration.UntilEachTurnEnd);
    await s.engine.recomputeContinuousEffects();
    expect(perm.cannotUnsuspend).toBe(true);
    // Neither combat lock rides along with it.
    expect(perm.cannotAttack).toBe(false);
    expect(perm.cannotBlock).toBe(false);
    expect(perm.cannotActivateWhenDigivolving).toBe(false);
  });

  it("publishes the [When Digivolving] lock on its own (BT19-038, KB Q5541-Q5545)", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const perm = digimon(0, 5000, VANILLA_CARD);
    p0.battleArea.push(perm);
    internalsOf(s.engine).continuous.addRestriction(
      perm.permanentId,
      "cannotActivateWhenDigivolving",
      EffectDuration.UntilEachTurnEnd,
    );

    await s.engine.recomputeContinuousEffects();
    expect(perm.cannotActivateWhenDigivolving).toBe(true);
    expect(perm.cannotUnsuspend).toBe(false);
  });

  it("projects a raising-area permanent too, where both locks still apply", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    p0.breeding = digimon(0, 3000, VANILLA_CARD);
    internalsOf(s.engine).continuous.addRestriction(
      p0.breeding.permanentId,
      "unsuspend",
      EffectDuration.UntilEachTurnEnd,
    );

    await s.engine.recomputeContinuousEffects();
    expect(p0.breeding.cannotUnsuspend).toBe(true);
  });
});

describe("Permanent.securityAttack projection", () => {
  it("reads 1 with no modifier at all", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const perm = digimon(0, 5000, VANILLA_CARD);
    p0.battleArea.push(perm);

    await s.engine.recomputeContinuousEffects();
    expect(perm.securityAttack).toBe(1);
    expect(perm.securityAttackModifier).toBe(0);
  });

  it("adds every ＜Security Attack +N＞ grant the engine resolved", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const perm = digimon(0, 5000, VANILLA_CARD);
    p0.battleArea.push(perm);
    const { continuous } = internalsOf(s.engine);
    continuous.addKeywordGrant(perm.permanentId, "SecurityAttack", EffectDuration.UntilEachTurnEnd, 2);

    await s.engine.recomputeContinuousEffects();
    expect(perm.securityAttack).toBe(3);
    expect(perm.securityAttackModifier).toBe(2);
  });

  it("floors at 0 under a negative modifier (Comprehensive Rules §16-4-4)", async () => {
    const s = setup();
    const p0 = s.state.players[0] as PlayerState;
    const perm = digimon(0, 5000, VANILLA_CARD);
    p0.battleArea.push(perm);
    internalsOf(s.engine).continuous.addKeywordGrant(
      perm.permanentId,
      "SecurityAttack",
      EffectDuration.UntilEachTurnEnd,
      -3,
    );

    await s.engine.recomputeContinuousEffects();
    expect(perm.securityAttack).toBe(0);
    expect(perm.securityAttackModifier).toBe(-3);
  });
});
