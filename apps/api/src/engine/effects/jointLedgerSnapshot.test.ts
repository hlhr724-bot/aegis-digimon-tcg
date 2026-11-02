import { expect, it } from "vitest";
import { EffectDuration } from "@aegis/shared/schema/enums";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { ModifierLedger, type PlayCostAdjustment } from "#api/engine/effects/modifiers";
import { ContinuousEffectLedger } from "#api/engine/effects/continuous";
import { SubTriggerRegistry, type SubTriggerSubscription } from "#api/engine/effects/subtriggers";
import type { ModifierLedgerState } from "#api/engine/effects/ModifierLedgerState";
import type { ContinuousLedgerState } from "#api/engine/effects/ContinuousLedgerState";
import type { SubTriggerRegistryState } from "#api/engine/effects/SubTriggerRegistryState";
import { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";
import { setupEngine } from "#api/engine/testkit/harness";

type Identity = { visits: number };

function createCallbacks(): RuntimeCallbackRegistry {
  const callbacks = new RuntimeCallbackRegistry();
  callbacks.registerFactory({
    key: "match",
    create: (payload) => {
      const identity = payload as Identity;
      return () => identity.visits >= 0;
    },
  });
  callbacks.registerFactory({
    key: "visit",
    create: (payload) => {
      const identity = payload as Identity;
      return async () => {
        identity.visits++;
      };
    },
  });
  return callbacks;
}

it("preserves one identity across modifier clauses, custom grants and delayed callback captures", async () => {
  const originalCallbacks = createCallbacks();
  const callbacks = createCallbacks();
  const identity = { visits: 0 };
  const originalModifiers = new ModifierLedger();
  const originalContinuous = new ContinuousEffectLedger();
  const originalSubTriggers = new SubTriggerRegistry();
  const match = originalCallbacks.create<PlayCostAdjustment["match"]>({ key: "match", payload: identity });
  originalModifiers.addPlayCostAdjustment(match, -1, false, {
    intrinsicEffectKey: identity,
    intrinsicCardId: "BT1-009",
  });
  originalContinuous.addCustomEffectGrant("physical-card", 0, "identity-grant", EffectDuration.Permanent, {
    activationIdentity: identity,
  });
  originalSubTriggers.subscribe({
    event: "whenPlayed",
    once: false,
    description: "shared identity watcher",
    run: originalCallbacks.create<SubTriggerSubscription["run"]>({ key: "visit", payload: identity }),
  });
  const snapshot = encodeRuntimeGraph({
    value: {
      modifiers: originalModifiers.getRuntimeState(),
      continuous: originalContinuous.getRuntimeState(),
      subTriggers: originalSubTriggers.getRuntimeState(),
      identity,
    },
    describeCallback: originalCallbacks.describe.bind(originalCallbacks),
  });
  const restored = decodeRuntimeGraph({
    snapshot: JSON.parse(JSON.stringify(snapshot)),
    createCallback: callbacks.create.bind(callbacks),
  }) as {
    modifiers: ModifierLedgerState;
    continuous: ContinuousLedgerState;
    subTriggers: SubTriggerRegistryState;
    identity: Identity;
  };
  const modifiers = new ModifierLedger();
  const continuous = new ContinuousEffectLedger();
  const subTriggers = new SubTriggerRegistry();
  modifiers.restoreRuntimeState(restored.modifiers);
  continuous.restoreRuntimeState(restored.continuous);
  subTriggers.restoreRuntimeState(restored.subTriggers);
  expect(modifiers.getRuntimeState().playCostAdjustments[0]!.intrinsicEffectKey).toBe(restored.identity);
  expect(continuous.listCustomEffectGrants()[0]!.activationIdentity).toBe(restored.identity);
  expect(await subTriggers.fire("whenPlayed", () => undefined)).toBe(1);
  expect(restored.identity.visits).toBe(1);
  expect(identity.visits).toBe(0);
  modifiers.addPlayCostAdjustment(
    callbacks.create<PlayCostAdjustment["match"]>({ key: "match", payload: restored.identity }),
    -1,
    false,
    { intrinsicEffectKey: restored.identity, intrinsicCardId: "BT1-009" },
  );
  expect(modifiers.playCostFor({ def: requireCardDefinition("BT1-009"), controllerSeat: 0 }, 5)).toBe(4);
});

it("adopts restored scope maps and expired recipient sets without clearing their shared containers", () => {
  const setup = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  const unit = setup.perm("source");
  const modifiers = new ModifierLedger();
  modifiers.addDpModifier(setup.state, unit.permanentId, 1000, EffectDuration.UntilEndBattle);
  modifiers.beginBattleScope(1);
  modifiers.beginBattleScope(2);
  modifiers.addDpModifier(setup.state, unit.permanentId, 2000, EffectDuration.UntilEndBattle);
  const modifierState = modifiers.getRuntimeState();
  modifiers.restoreRuntimeState(modifierState);
  expect(modifiers.getRuntimeState().battleScopes).toBe(modifierState.battleScopes);
  expect(modifierState.battleScopes.size).toBe(2);
  modifiers.sweep(setup.state, "endBattle", 0, 2);
  expect(unit.currentDP).toBe(unit.baseDP + 1000);
  const continuous = new ContinuousEffectLedger(() => 0);
  continuous.addRestriction(unit.permanentId, "beAffected", EffectDuration.UntilOwnerTurnEnd);
  continuous.sweep(setup.state, "ownerTurnEnd", 0);
  const continuousState = continuous.getRuntimeState();
  continuous.restoreRuntimeState(continuousState);
  expect(continuous.getRuntimeState().expiredAffectationRecipients).toBe(continuousState.expiredAffectationRecipients);
  expect(continuous.takeExpiredAffectationRecipients()).toEqual([unit.permanentId]);
  expect(continuousState.expiredAffectationRecipients.size).toBe(0);
});

it("clears departure marks absent from the restored state even when the grant object is shared", () => {
  const continuous = new ContinuousEffectLedger();
  continuous.addCustomEffectGrant("physical-card", 0, "grant", EffectDuration.Permanent);
  const beforeDeparture = continuous.getRuntimeState();
  continuous.markCustomEffectGrantsLeftField(["physical-card"]);
  continuous.restoreRuntimeState(beforeDeparture);
  continuous.dropCustomEffectGrantsOfReenteringCards(["physical-card"]);
  expect(continuous.listCustomEffectGrants()).toHaveLength(1);
});
