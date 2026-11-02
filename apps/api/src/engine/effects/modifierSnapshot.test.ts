import { EffectDuration } from "@aegis/shared/schema/enums";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { expect, it } from "vitest";
import { ModifierLedger, type PlayCostAdjustment } from "#api/engine/effects/modifiers";
import { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import { setupEngine } from "#api/engine/testkit/harness";

it("restores modifier ownership across controller changes and nested battle scopes", () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "unit" }] } });
  const unit = setup.perm("unit");
  const original = new ModifierLedger();
  original.addDpModifier(setup.state, unit.permanentId, 1000, EffectDuration.UntilEndBattle);
  original.beginBattleScope(1);
  original.addDpModifier(setup.state, unit.permanentId, 2000, EffectDuration.UntilEndBattle);
  original.beginBattleScope(2);
  original.addDpModifier(setup.state, unit.permanentId, 3000, EffectDuration.UntilEndBattle);
  original.addPierceGrant(unit.permanentId, EffectDuration.UntilOwnerTurnEnd, { durationOwnerSeat: 0 });
  const snapshot = original.snapshot();
  const restored = new ModifierLedger();
  restored.restore({ snapshot: JSON.parse(JSON.stringify(snapshot)) });
  restored.sweep(setup.state, "endBattle", 0, 2);
  expect(unit.currentDP).toBe(unit.baseDP + 3000);
  restored.endBattleScope(2);
  restored.sweep(setup.state, "endBattle", 0, 1);
  expect(unit.currentDP).toBe(unit.baseDP);
  unit.controllerSeat = 1;
  restored.sweep(setup.state, "ownerTurnEnd", 0);
  expect(restored.hasPierce(unit.permanentId)).toBe(false);
  expect(original.hasPierce(unit.permanentId)).toBe(true);
  expect(original.snapshot()).toEqual(snapshot);
});

it("retains continuous override activation order and future modifier identifiers", () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "unit" }] } });
  const unit = setup.perm("unit");
  const original = new ModifierLedger();
  original.addBaseDpOverride(setup.state, unit.permanentId, 1000, EffectDuration.Permanent, { continuous: true });
  original.addBaseDpOverride(setup.state, unit.permanentId, 2000, EffectDuration.Permanent);
  original.clearContinuous(setup.state);
  const restored = new ModifierLedger();
  restored.restore({ snapshot: JSON.parse(JSON.stringify(original.snapshot())) });
  restored.addBaseDpOverride(setup.state, unit.permanentId, 1000, EffectDuration.Permanent, { continuous: true });
  expect(unit.currentDP).toBe(2000);
  restored.addBaseDpOverride(setup.state, unit.permanentId, 3000, EffectDuration.Permanent);
  expect(unit.currentDP).toBe(3000);
});

it("rebinds live cost predicates and preserves intrinsic-clause identity and sequence", () => {
  const originalCallbacks = new RuntimeCallbackRegistry();
  const restoredCallbacks = new RuntimeCallbackRegistry();
  const originalRuntime = { enabled: true };
  const restoredRuntime = { enabled: true };
  for (const [callbacks, runtime] of [
    [originalCallbacks, originalRuntime],
    [restoredCallbacks, restoredRuntime],
  ] as const) {
    callbacks.registerFactory({
      key: "match-seat",
      create: (seat) => {
        if (seat !== 0 && seat !== 1) {
          throw new Error("Invalid seat");
        }
        return (facts: Parameters<PlayCostAdjustment["match"]>[0]) => runtime.enabled && facts.controllerSeat === seat;
      },
    });
  }
  const match = originalCallbacks.create<PlayCostAdjustment["match"]>({ key: "match-seat", payload: 0 });
  const original = new ModifierLedger();
  const intrinsicEffectKey = { clause: "same-clause" };
  const intrinsicCardId = "BT1-009";
  original.addPlayCostAdjustment(match, -1, false, { intrinsicEffectKey, intrinsicCardId });
  const lastId = original.addPlayCostAdjustment(match, -1, false, { intrinsicEffectKey, intrinsicCardId });
  const facts = { def: requireCardDefinition(intrinsicCardId), controllerSeat: 0 as const };
  expect(original.playCostFor(facts, 5)).toBe(4);
  const restored = new ModifierLedger();
  const snapshot = original.snapshot({ callbacks: originalCallbacks });
  restored.restore({ snapshot: JSON.parse(JSON.stringify(snapshot)), callbacks: restoredCallbacks });
  expect(restored.playCostFor(facts, 5)).toBe(4);
  restoredRuntime.enabled = false;
  expect(restored.playCostFor(facts, 5)).toBe(5);
  expect(original.playCostFor(facts, 5)).toBe(4);
  const nextMatch = restoredCallbacks.create<PlayCostAdjustment["match"]>({ key: "match-seat", payload: 0 });
  expect(restored.addPlayCostAdjustment(nextMatch, -1, false).id).toBe(lastId.id + 1);
});

it("refuses snapshots with undescribed callbacks and does not partially restore failures", () => {
  const source = new ModifierLedger();
  source.addPlayCostAdjustment(() => true, -1, false);
  expect(() => source.snapshot()).toThrow("descriptor");
  const restored = new ModifierLedger();
  restored.addPierceGrant("kept", EffectDuration.Permanent);
  const snapshot = restored.snapshot();
  expect(() => restored.restore({ snapshot: { version: 1, root: null, nodes: [] } })).toThrow("Invalid modifier");
  expect(restored.snapshot()).toEqual(snapshot);
});
