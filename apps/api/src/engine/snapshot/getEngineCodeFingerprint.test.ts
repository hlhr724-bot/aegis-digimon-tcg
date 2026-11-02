import { afterEach, expect, it } from "vitest";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registeredCompiledCards } from "#api/engine/effects/interpreter/compiledCards";
import { getEngineCodeFingerprint } from "#api/engine/snapshot/getEngineCodeFingerprint";

const CARD_ID = "SNAPSHOT-FINGERPRINT-MUTABLE-PROBE";
const original = registeredCompiledCards.get(CARD_ID);

afterEach(() => {
  if (original === undefined) {
    registeredCompiledCards.delete(CARD_ID);
  } else {
    registeredCompiledCards.set(CARD_ID, original);
  }
});

it("recomputes mutable test registry entries when executable IR changes", () => {
  const program: CompiledCard = {
    coverage: "full",
    residual: [],
    effects: [{ trigger: "Main", actions: [{ kind: "GainMemory", amount: 1 }] }],
  };
  registeredCompiledCards.set(CARD_ID, program);
  const before = getEngineCodeFingerprint();
  const action = program.effects[0]!.actions[0]!;
  if (action.kind !== "GainMemory") throw new Error("Unexpected fingerprint probe action");
  action.amount = 2;
  const after = getEngineCodeFingerprint();
  expect(after).not.toBe(before);
});

it("invalidates the cached catalog fingerprint when a card is registered or removed", () => {
  const baseline = getEngineCodeFingerprint();
  registeredCompiledCards.set(CARD_ID, {
    coverage: "full",
    residual: [],
    effects: [{ trigger: "Main", actions: [{ kind: "GainMemory", amount: 1 }] }],
  });
  const registered = getEngineCodeFingerprint();
  registeredCompiledCards.delete(CARD_ID);

  expect(registered).not.toBe(baseline);
  expect(getEngineCodeFingerprint()).toBe(baseline);
});
