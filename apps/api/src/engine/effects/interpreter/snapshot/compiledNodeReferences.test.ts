import { expect, it } from "vitest";
import "#api/cards/index";
import { EffectTiming } from "@aegis/shared/schema/enums";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { SubTriggerAction } from "@aegis/shared/effects/ir/actions/subTrigger";
import { registerIrCard } from "#api/engine/effects/interpreter/registration/module";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter/compiledCards";
import { getEffectModule } from "#api/engine/effects/registry";
import { cardSourceOf } from "#api/engine/gameEngine/effectContext";
import { setupEngine } from "#api/engine/testkit/harness";
import { encodeRuntimeGraph } from "#api/engine/snapshot/encodeRuntimeGraph";
import { decodeRuntimeGraph } from "#api/engine/snapshot/decodeRuntimeGraph";
import { CompiledRootKind } from "#api/engine/effects/interpreter/snapshot/CompiledRootKind";
import type { CompiledNodeReference } from "#api/engine/effects/interpreter/snapshot/CompiledNodeReference";

const CARD_ID = "BT1-009";

function createProgram(): CompiledCard {
  return {
    coverage: "full",
    residual: [],
    effects: [
      {
        trigger: "YourTurn",
        frequency: "OncePerTurn",
        actions: [
          { kind: "SubTrigger", event: "whenPlayed", actions: [{ kind: "Draw", controller: "mine", amount: 1 }] },
        ],
      },
    ],
  };
}

it("restores canonical action identities after rebuilding a cold module with equivalent IR", () => {
  const originalProgram = runtimeCompiledCard(CARD_ID)!;
  try {
    registerIrCard(CARD_ID, createProgram());
    const compiled = runtimeCompiledCard(CARD_ID)!;
    const action = (compiled.effects[0]!.actions[0] as SubTriggerAction).actions[0]!;
    const setup = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "source" }] } });
    getEffectModule(CARD_ID)!.effectsForTiming(EffectTiming.None, cardSourceOf(setup.engine, setup.inst("source")));
    const descriptor = setup.engine.runtimeReferences.describe(action)!;
    expect((descriptor.payload as CompiledNodeReference).rootKey).toMatch(
      new RegExp(`^${CompiledRootKind.RESOLVED.value}/`),
    );
    const snapshot = encodeRuntimeGraph({
      value: { action, answers: new Map([[action, true]]) },
      references: setup.engine.runtimeReferences,
    });
    registerIrCard(CARD_ID, createProgram());
    const current = (runtimeCompiledCard(CARD_ID)!.effects[0]!.actions[0] as SubTriggerAction).actions[0]!;
    expect(current).not.toBe(action);
    const restored = decodeRuntimeGraph({
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      references: setup.engine.runtimeReferences,
    }) as { action: object; answers: Map<object, boolean> };
    expect(restored.action).toBe(current);
    expect(restored.answers.get(current)).toBe(true);
  } finally {
    registerIrCard(CARD_ID, originalProgram);
  }
});

it("rejects references after the installed card rules change", () => {
  const originalProgram = runtimeCompiledCard(CARD_ID)!;
  try {
    registerIrCard(CARD_ID, createProgram());
    const action = (runtimeCompiledCard(CARD_ID)!.effects[0]!.actions[0] as SubTriggerAction).actions[0]!;
    const setup = setupEngine();
    const snapshot = encodeRuntimeGraph({ value: action, references: setup.engine.runtimeReferences });
    const changed = createProgram();
    const draw = (changed.effects[0]!.actions[0] as SubTriggerAction).actions[0]!;
    if (draw.kind !== "Draw") {
      throw new Error("Expected the test draw action");
    }
    draw.amount = 2;
    registerIrCard(CARD_ID, changed);
    expect(() => decodeRuntimeGraph({ snapshot, references: setup.engine.runtimeReferences })).toThrow(
      "fingerprint mismatch",
    );
    expect(() => setup.engine.runtimeReferences.describe(action)).toThrow("replaced IR root");
  } finally {
    registerIrCard(CARD_ID, originalProgram);
  }
});
