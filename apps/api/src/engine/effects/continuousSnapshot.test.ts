import { EffectDuration } from "@aegis/shared/schema/enums";
import { expect, it } from "vitest";
import { ContinuousEffectLedger } from "#api/engine/effects/continuous";
import { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import { setupEngine } from "#api/engine/testkit/harness";

it("preserves duration ownership and nested battle membership for restrictions and keywords", () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "unit" }] } });
  const id = setup.perm("unit").permanentId;
  const original = new ContinuousEffectLedger(() => 0);
  original.addRestriction(id, "beAffected", EffectDuration.UntilOwnerTurnEnd);
  original.addKeywordGrant(id, "Blocker", EffectDuration.UntilEndBattle);
  original.beginBattleScope(1);
  original.beginBattleScope(2);
  original.addKeywordGrant(id, "Piercing", EffectDuration.UntilEndBattle);
  const restored = new ContinuousEffectLedger(() => 1);
  restored.restore({ snapshot: JSON.parse(JSON.stringify(original.snapshot())) });
  restored.sweep(setup.state, "endBattle", 0, 2);
  expect(restored.hasKeyword(id, "Blocker")).toBe(true);
  expect(restored.hasKeyword(id, "Piercing")).toBe(false);
  restored.endBattleScope(2);
  restored.sweep(setup.state, "endBattle", 0, 1);
  expect(restored.hasKeyword(id, "Blocker")).toBe(false);
  restored.sweep(setup.state, "ownerTurnEnd", 0);
  expect(restored.hasRestriction(id, "beAffected")).toBe(false);
  expect(restored.takeExpiredAffectationRecipients()).toEqual([id]);
  expect(original.hasRestriction(id, "beAffected")).toBe(true);
});

it("retains custom grant activation aliases, sequence and departure marks", () => {
  const original = new ContinuousEffectLedger();
  const identity = {};
  original.addCustomEffectGrant("card-a", 0, "test-effect", EffectDuration.Permanent, { activationIdentity: identity });
  original.addCustomEffectGrant("card-a", 0, "other-effect", EffectDuration.Permanent, {
    activationIdentity: identity,
  });
  original.addCustomEffectGrant("card-b", 0, "kept", EffectDuration.Permanent);
  original.markCustomEffectGrantsLeftField(["card-a"]);
  const restored = new ContinuousEffectLedger();
  restored.restore({ snapshot: JSON.parse(JSON.stringify(original.snapshot())) });
  const grants = restored.listCustomEffectGrants();
  expect(grants[0]!.activationIdentity).toBe(grants[1]!.activationIdentity);
  const lastId = grants.at(-1)!.grantId;
  restored.addCustomEffectGrant("card-c", 0, "new", EffectDuration.Permanent);
  expect(restored.listCustomEffectGrants().at(-1)!.grantId).toBe(lastId + 1);
  restored.dropCustomEffectGrantsOfReenteringCards(["card-a", "card-b"]);
  expect(restored.listCustomEffectGrants().map((entry) => entry.instanceId)).toEqual(["card-b", "card-c"]);
  expect(original.listCustomEffectGrants()).toHaveLength(3);
});

it("rebinds conditional keywords through the destination callback registry", () => {
  const original = new RuntimeCallbackRegistry();
  const restored = new RuntimeCallbackRegistry();
  const originalRuntime = { enabled: true };
  const restoredRuntime = { enabled: false };
  for (const [callbacks, runtime] of [
    [original, originalRuntime],
    [restored, restoredRuntime],
  ] as const) {
    callbacks.registerFactory({ key: "active", create: () => () => runtime.enabled });
  }
  const sourceLedger = new ContinuousEffectLedger();
  sourceLedger.addKeywordGrant("unit", "Blocker", EffectDuration.Permanent, undefined, {
    active: original.create<() => boolean>({ key: "active", payload: null }),
  });
  const destination = new ContinuousEffectLedger();
  destination.restore({
    snapshot: JSON.parse(JSON.stringify(sourceLedger.snapshot({ callbacks: original }))),
    callbacks: restored,
  });
  expect(sourceLedger.hasKeyword("unit", "Blocker")).toBe(true);
  expect(destination.hasKeyword("unit", "Blocker")).toBe(false);
  restoredRuntime.enabled = true;
  expect(destination.hasKeyword("unit", "Blocker")).toBe(true);
});

it("rejects snapshots and restores during a live predicate evaluation", () => {
  const ledger = new ContinuousEffectLedger();
  const empty = ledger.snapshot();
  ledger.addKeywordGrant("unit", "Blocker", EffectDuration.Permanent, undefined, {
    active: () => {
      expect(() => ledger.snapshot()).toThrow("predicates");
      expect(() => ledger.restore({ snapshot: empty })).toThrow("predicates");
      return true;
    },
  });
  expect(ledger.hasKeyword("unit", "Blocker")).toBe(true);
  expect(() => ledger.snapshot()).toThrow("descriptor");
});
