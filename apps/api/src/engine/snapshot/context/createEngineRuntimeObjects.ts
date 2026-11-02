import { registerScopedPrimitiveFactory } from "#api/engine/snapshot/context/registerScopedPrimitiveFactory";
import { EnginePrimitivePortKind } from "#api/engine/snapshot/context/EnginePrimitivePortKind";
import { scopedPrimitiveDescriptors } from "#api/engine/effects/scopes/scopedPrimitiveDescriptors";
import type { Primitives } from "#api/engine/effects/EffectContext";
import { createNoPromptDecisionApi } from "#api/engine/decisions/createNoPromptDecisionApi";
import { noPromptDecisionApis } from "#api/engine/decisions/noPromptDecisionApis";
import { EngineDecisionPortKind } from "#api/engine/snapshot/context/EngineDecisionPortKind";
import { MatchedTriggerHistory } from "#api/engine/effects/interpreter/subtriggers/MatchedTriggerHistory";
import { registerPrimitiveRuntimeCallbacks } from "#api/engine/effects/verbs/snapshot/registerPrimitiveRuntimeCallbacks";
import { registerEngineSchemaFactories } from "#api/engine/snapshot/schema/registerEngineSchemaFactories";
import { registerResolutionEnvironmentFactory } from "#api/engine/snapshot/context/registerResolutionEnvironmentFactory";
import { registerResidentCostSourceFactory } from "#api/engine/snapshot/context/registerResidentCostSourceFactory";
import { registerResolutionDependencyFactory } from "#api/engine/snapshot/context/registerResolutionDependencyFactory";
import { registerRuntimeEffectFactory } from "#api/engine/snapshot/context/registerRuntimeEffectFactory";
import { registerTimingLockedEffectFactory } from "#api/engine/snapshot/context/registerTimingLockedEffectFactory";
import { sourceRuntimeObjectRegistries } from "#api/engine/snapshot/context/sourceRuntimeObjectRegistries";
import { TimingWindowState } from "#api/engine/effects/resolution/TimingWindowState";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { ResolutionPlan } from "#api/engine/decisions/resolutionPlan";
import { CardInstance } from "@aegis/shared/schema/CardInstance";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import type { GameEngine } from "#api/engine/GameEngine";
import type { CardSource } from "#api/engine/effects/CardSource";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { TriggerInfo } from "#api/engine/effects/context/triggers";
import { createCardSource } from "#api/engine/cards/CardSource";
import { createCardStateLookup } from "#api/engine/effects/context";
import { buildEffectContext, effectAccess, effectPrimitives } from "#api/engine/gameEngine/effectContext";
import { createLenderCardSource } from "#api/engine/effects/interpreter/actions/createLenderCardSource";
import { lenderCardSourcePayloads } from "#api/engine/effects/interpreter/actions/lenderCardSourcePayloads";
import type { LenderCardSourcePayload } from "#api/engine/effects/interpreter/actions/LenderCardSourcePayload";
import { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = { engine: GameEngine };
type SourcePayload = { instanceId: string; cardId: string; ownerSeat: 0 | 1 };
type ContextPayload = {
  source: CardSource;
  askKind: EngineDecisionPortKind;
  fxKind: EnginePrimitivePortKind;
  scopedFx?: Primitives;
  state: Record<string, unknown> & { trigger: TriggerInfo };
};

const CONTEXT_PORTS = new Set(["source", "game", "fx", "ask", "usage"]);
const FORBIDDEN_STATE_KEYS = new Set([...CONTEXT_PORTS, "__proto__", "prototype", "constructor"]);

export function createEngineRuntimeObjects({ engine }: Params): RuntimeObjectRegistry {
  const registry = new RuntimeObjectRegistry();
  registerPrimitiveRuntimeCallbacks({ engine });
  registerEngineSchemaFactories({ objects: registry });
  registerScopedPrimitiveFactory({ objects: registry });
  registry.registerFactory({
    key: EngineRuntimeObjectKind.MATCHED_TRIGGER_HISTORY.value,
    prototype: MatchedTriggerHistory.prototype,
    allocate: () => new MatchedTriggerHistory(),
    describe: (value) => (value as MatchedTriggerHistory).snapshot(),
    hydrate: ({ value, payload }) => (value as MatchedTriggerHistory).restore(payload),
  });
  registerRuntimeEffectFactory({ objects: registry });
  registerTimingLockedEffectFactory({ engine, objects: registry });
  registerResolutionDependencyFactory({ engine, objects: registry });
  registerResidentCostSourceFactory({ engine });
  registerResolutionEnvironmentFactory({ engine, objects: registry });
  registry.registerFactory({
    key: EngineRuntimeObjectKind.TIMING_WINDOW.value,
    allocate: () => new TimingWindowState({ timing: EffectTiming.OnStartTurn, passBudget: 1 }),
    describe: (value) => (value as TimingWindowState).getRuntimeState(),
    hydrate: ({ value, payload }) => (value as TimingWindowState).restoreRuntimeState(payload),
  });
  registry.registerFactory({
    key: EngineRuntimeObjectKind.RESOLUTION_PLAN.value,
    allocate: () => new ResolutionPlan(),
    describe: (value) => (value as ResolutionPlan).getRuntimeState(),
    hydrate: ({ value, payload }) => (value as ResolutionPlan).restoreRuntimeState(payload),
  });
  registry.registerFactory({
    key: EngineRuntimeObjectKind.CARD_SOURCE.value,
    allocate: () => ({}),
    describe: (value) => {
      const source = value as CardSource;
      if (source.definition !== requireCardDefinition(source.cardId) || source.gainedOnPermanentId !== undefined) {
        throw new Error("Card source requires a specialized runtime descriptor");
      }
      return { instanceId: source.instanceId, cardId: source.cardId, ownerSeat: source.ownerSeat };
    },
    hydrate: ({ value, payload }) => {
      if (!isSourcePayload(payload)) {
        throw new Error("Invalid card-source runtime payload");
      }
      const instance = new CardInstance();
      instance.instanceId = payload.instanceId;
      instance.cardId = payload.cardId;
      instance.ownerSeat = payload.ownerSeat;
      engine.cardStateLookup ??= createCardStateLookup(engine.state);
      engine.cardStateLookup.runtimeObjects = engine.runtimeObjects;
      Object.assign(value, createCardSource(instance, engine.cardStateLookup));
      sourceRuntimeObjectRegistries.set(value as CardSource, registry);
    },
  });
  registry.registerFactory({
    key: EngineRuntimeObjectKind.LENDER_CARD_SOURCE.value,
    allocate: () => ({}),
    describe: (value) => {
      const payload = lenderCardSourcePayloads.get(value as CardSource);
      if (payload === undefined) {
        throw new Error("Lender card source has no runtime payload");
      }
      return payload;
    },
    hydrate: ({ value, payload }) => {
      if (!isLenderSourcePayload(payload)) {
        throw new Error("Invalid lender card-source runtime payload");
      }
      const source = createLenderCardSource({ game: effectAccess(engine), payload });
      Object.assign(value, source);
      lenderCardSourcePayloads.set(value as CardSource, payload);
    },
  });
  registry.registerFactory({
    key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value,
    allocate: () => ({}),
    describe: (value) => {
      const context = value as EffectContext;
      const unsupported = [
        { name: "game", value: context.game.state !== engine.state },
        { name: "ask", value: context.ask !== engine.decisionApi && !noPromptDecisionApis.has(context.ask) },
        { name: "usage", value: context.usage !== engine.tracker },
        {
          name: "fx",
          value:
            context.fx !== effectPrimitives(engine, context.source.ownerSeat) &&
            !scopedPrimitiveDescriptors.has(context.fx),
        },
      ].filter((port) => port.value);
      if (unsupported.length !== 0) {
        throw new Error(
          `Effect context requires specialized runtime ports: ${unsupported.map((port) => port.name).join(", ")}`,
        );
      }
      const state = Object.fromEntries(Object.entries(context).filter(([key]) => !CONTEXT_PORTS.has(key)));
      return {
        source: context.source,
        state,
        fxKind: scopedPrimitiveDescriptors.has(context.fx)
          ? EnginePrimitivePortKind.SCOPED.value
          : EnginePrimitivePortKind.STANDARD.value,
        ...(scopedPrimitiveDescriptors.has(context.fx) ? { scopedFx: context.fx } : {}),
        askKind: noPromptDecisionApis.has(context.ask)
          ? EngineDecisionPortKind.NO_PROMPT.value
          : EngineDecisionPortKind.STANDARD.value,
      };
    },
    hydrate: ({ value, payload }) => {
      if (!isContextPayload(payload)) {
        throw new Error("Invalid effect-context runtime payload");
      }
      const base = buildEffectContext(
        engine,
        payload.source,
        payload.state.trigger,
        payload.askKind === EngineDecisionPortKind.NO_PROMPT.value ? createNoPromptDecisionApi() : undefined,
      );
      if (payload.fxKind === EnginePrimitivePortKind.SCOPED.value) {
        if (payload.scopedFx === undefined || !scopedPrimitiveDescriptors.has(payload.scopedFx)) {
          throw new Error("Invalid scoped effect context");
        }
        base.fx = payload.scopedFx;
      }
      for (const [key, entry] of [...Object.entries(base), ...Object.entries(payload.state)]) {
        Object.defineProperty(value, key, { value: entry, writable: true, enumerable: true, configurable: true });
      }
    },
  });
  return registry;
}

function isSourcePayload(value: unknown): value is SourcePayload {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const source = value as SourcePayload;
  return (
    typeof source.instanceId === "string" &&
    source.instanceId.length > 0 &&
    typeof source.cardId === "string" &&
    source.cardId.length > 0 &&
    (source.ownerSeat === 0 || source.ownerSeat === 1)
  );
}

function isContextPayload(value: unknown): value is ContextPayload {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const payload = value as ContextPayload;
  if (
    (payload.fxKind !== EnginePrimitivePortKind.STANDARD.value &&
      payload.fxKind !== EnginePrimitivePortKind.SCOPED.value) ||
    (payload.askKind !== EngineDecisionPortKind.STANDARD.value &&
      payload.askKind !== EngineDecisionPortKind.NO_PROMPT.value) ||
    payload.source === null ||
    typeof payload.source !== "object" ||
    typeof payload.source.permanent !== "function" ||
    typeof payload.source.isOwnersTurn !== "function"
  ) {
    return false;
  }
  return (
    payload.state !== null &&
    typeof payload.state === "object" &&
    payload.state.trigger !== null &&
    typeof payload.state.trigger === "object" &&
    !Object.keys(payload.state).some((key) => FORBIDDEN_STATE_KEYS.has(key))
  );
}

function isLenderSourcePayload(value: unknown): value is LenderCardSourcePayload {
  return (
    isSourcePayload(value) &&
    typeof (value as LenderCardSourcePayload).permanentId === "string" &&
    (value as LenderCardSourcePayload).permanentId.length > 0
  );
}
