import type { RuntimeReferenceRegistry } from "#api/engine/snapshot/RuntimeReferenceRegistry";
import type { ResolutionPlanState } from "#api/engine/decisions/ResolutionPlanState";
import type { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import type { RuntimeGraphSnapshot } from "#api/engine/snapshot/RuntimeGraphSnapshot";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";
import type { CollectedEffect } from "../effects/collect.js";
import { triggerKeyOf } from "./triggerKeyOf.js";

/**
 * A controller's plan for the simultaneous effects of one timing window: the order they
 * resolve in and preset answers to the yes/no questions each effect asks.
 *
 * The resolver re-collects after every resolution, so it still asks "which effect next?"
 * once per effect. The plan answers those repeat prompts for the controller while an effect
 * they ordered is still offered and every offered effect was already in front of them. A
 * newly triggered effect reopens the prompt, and so does a remainder they left unordered
 * once the ordered effects have resolved. One plan lives exactly as long as its timing window, so an
 * answer never leaks into a later window where the same card triggers again.
 */
type SnapshotParams = {
  callbacks?: RuntimeCallbackRegistry;
  objects?: RuntimeObjectRegistry;
  references?: RuntimeReferenceRegistry;
};
type RestoreParams = {
  snapshot: RuntimeGraphSnapshot;
  callbacks?: RuntimeCallbackRegistry;
  objects?: RuntimeObjectRegistry;
  references?: RuntimeReferenceRegistry;
};

export class ResolutionPlan {
  private order: string[] = [];
  private presets = new Map<string, boolean>();
  private seen = new Set<string>();
  private activationKeys = new Map<object, Map<string, string>>();
  private usedKeys = new Set<string>();
  private grantSourceInstances = new Map<number, string>();

  getRuntimeState(): ResolutionPlanState {
    return {
      order: this.order,
      presets: this.presets,
      seen: this.seen,
      activationKeys: this.activationKeys,
      usedKeys: this.usedKeys,
      grantSourceInstances: this.grantSourceInstances,
    };
  }

  restoreRuntimeState(state: unknown): void {
    if (!isResolutionPlanState(state)) {
      throw new Error("Invalid resolution plan state");
    }
    this.order = state.order;
    this.presets = state.presets;
    this.seen = state.seen;
    this.activationKeys = state.activationKeys;
    this.usedKeys = state.usedKeys;
    this.grantSourceInstances = state.grantSourceInstances;
  }

  snapshot({ callbacks, objects, references }: SnapshotParams = {}): RuntimeGraphSnapshot {
    return encodeRuntimeGraph({
      value: this.getRuntimeState(),
      describeCallback: callbacks?.describe.bind(callbacks),
      describeObject: objects?.describe.bind(objects),
      references,
    });
  }

  restore({ snapshot, callbacks, objects, references }: RestoreParams): void {
    this.restoreRuntimeState(
      decodeRuntimeGraph({ snapshot, createCallback: callbacks?.create.bind(callbacks), objects, references }),
    );
  }

  /** Keep each event's key stable as earlier activations leave this window's pending list. */
  keyFor(collected: CollectedEffect): string {
    // A granted effect follows the Digimon through evolution. Keep the first
    // physical source anchor for this window while retaining distinct events
    // and independently materialized grant copies below.
    let sourceInstanceId = collected.source.instanceId;
    if (collected.grantedEffectId !== undefined) {
      const prior = this.grantSourceInstances.get(collected.grantedEffectId);
      if (prior === undefined) this.grantSourceInstances.set(collected.grantedEffectId, sourceInstanceId);
      else sourceInstanceId = prior;
    }
    const base = triggerKeyOf(collected, sourceInstanceId);
    const identity = collected.activationIdentity;
    if (identity === undefined) {
      this.usedKeys.add(base);
      return base;
    }
    let keys = this.activationKeys.get(identity);
    if (keys === undefined) {
      keys = new Map();
      this.activationKeys.set(identity, keys);
    }
    const existing = keys.get(base);
    if (existing !== undefined) return existing;
    let key = base;
    let occurrence = 1;
    while (this.usedKeys.has(key)) key = `${base}/activation-${++occurrence}`;
    this.usedKeys.add(key);
    keys.set(base, key);
    return key;
  }

  /** Record a controller's answer to `offered`. Keys it orders move to the front; earlier plans keep the rest. */
  adopt(
    order: readonly string[],
    optionalAnswers: Readonly<Record<string, boolean>> = {},
    offered: readonly string[] = order,
  ): void {
    this.order = [...order, ...this.order.filter((key) => !order.includes(key))];
    for (const key of [...offered, ...order]) this.seen.add(key);
    for (const [key, accept] of Object.entries(optionalAnswers)) this.presets.set(key, accept);
  }

  /** The planned key to resolve next, or undefined when no ordered key is offered or an offered key is new. */
  nextOf(offered: readonly string[]): string | undefined {
    if (!offered.every((key) => this.seen.has(key))) return undefined;
    return this.order.find((key) => offered.includes(key));
  }

  /** The preset answer (true = use, false = skip) for this effect's yes/no questions, if any. */
  presetFor(key: string): boolean | undefined {
    return this.presets.get(key);
  }
}

function isResolutionPlanState(value: unknown): value is ResolutionPlanState {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const state = value as ResolutionPlanState;
  if (
    !Array.isArray(state.order) ||
    !state.order.every((key) => typeof key === "string") ||
    !(state.presets instanceof Map) ||
    !(state.seen instanceof Set) ||
    !(state.activationKeys instanceof Map) ||
    !(state.usedKeys instanceof Set) ||
    !(state.grantSourceInstances instanceof Map)
  ) {
    return false;
  }
  return (
    [...state.presets].every(([key, answer]) => typeof key === "string" && typeof answer === "boolean") &&
    [...state.activationKeys].every(
      ([identity, keys]) =>
        identity !== null &&
        (typeof identity === "object" || typeof identity === "function") &&
        keys instanceof Map &&
        [...keys].every(([base, key]) => typeof base === "string" && typeof key === "string"),
    ) &&
    [...state.seen].every((key) => typeof key === "string") &&
    [...state.usedKeys].every((key) => typeof key === "string") &&
    [...state.grantSourceInstances].every(
      ([id, source]) => Number.isSafeInteger(id) && id >= 0 && typeof source === "string",
    )
  );
}
