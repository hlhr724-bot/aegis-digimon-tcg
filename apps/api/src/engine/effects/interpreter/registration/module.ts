import { canCancelOptionalActivation } from "#api/engine/effects/interpreter/canCancelOptionalActivation";
import { getActivationTextEmphasis } from "#api/engine/effects/interpreter/getActivationTextEmphasis";
import { registeredCompiledCardFingerprints } from "#api/engine/effects/interpreter/registration/RegisteredCompiledCardFingerprints";
import { freezeCompiledCard } from "#api/engine/effects/interpreter/registration/freezeCompiledCard";
import { trackRuntimeEffect } from "#api/engine/effects/interpreter/snapshot/trackRuntimeEffect";
import { runtimeCompiledNodeRegistry } from "#api/engine/effects/interpreter/snapshot/runtimeCompiledNodeRegistry";
import { CompiledRootKind } from "#api/engine/effects/interpreter/snapshot/CompiledRootKind";
import type { CompiledNodeRegistry } from "#api/engine/effects/interpreter/snapshot/CompiledNodeRegistry";
// Building the EffectModule a compiled card registers.

import type { CardSource } from "../../CardSource.js";
import type { Effect } from "../../Effect.js";
import type { EffectModule } from "../../EffectModule.js";
import type { BuilderOptions } from "../../builders.js";
import { getEffectModule, registerCard, unregisterCard } from "../../registry.js";
import { registeredCompiledCards, registeredIrModules } from "../compiledCards.js";
import { describeEffect } from "../describe.js";
import { runEffect } from "../dispatch.js";
import { trashDelaySource } from "../optionTrash.js";
import { AttackTargetScope } from "@aegis/shared/effects/ir/actions/AttackTargetScope";
import {
  builderForTrigger,
  canActivateEffect,
  providesEffectImmunity,
  readsSelfKeyword,
  timingsForTrigger,
  turnOwnerGuard,
  withIntrinsicDelayGate,
  withSubTriggerFrequency,
  withSubTriggerTurnScope,
} from "../effect.js";
import { evaluateCondition } from "../conditions.js";
import {
  declaresUnimplementedEngageKeyword,
  declaresExecuteKeyword,
  detectAllowDigiXrosMaterialsFromTrash,
  engageActivatedEffect,
  executeActivatedEffect,
  isIntrinsicDigisorptionMarker,
  overclockActivatedEffect,
  registerBlastDigivolveFromEffects,
  registerDigisorptionFromEffects,
  registerDigisorptionRedirectorFromEffects,
  registerTamerOntoFromEffects,
  synthesizedOverclockTrait,
  trainingActivatedEffect,
  vortexActivatedEffect,
  hasExplicitVortexEndOfTurnAttack,
} from "./keywords.js";
import {
  collectWouldBePlayedSelfReducers,
  collectWouldDigivolveSelfReducers,
  isIntrinsicWouldBePlayedSelfReducerMarker,
  isIntrinsicWouldDigivolveSelfReducerMarker,
} from "./reducers.js";
import { normalizeCompiledCard } from "./normalize.js";
import { withPrintedClauses } from "./printedClauses.js";
import { CardKind, compiledEffects, EffectTiming, getCardDefinition, isOption } from "@aegis/shared";
import type { Action, CardEffect, CompiledCard } from "@aegis/shared";
import { permanentMatchesFilter } from "../matching/permanent.js";
import { scaleFactor } from "../scaling.js";
import { candidatePermanents } from "../targeting/permanents.js";
import { isDigiXrosPickerReplacement } from "#api/engine/effects/interpreter/actions/isDigiXrosPickerReplacement";
import { getActivationMemoryCost } from "#api/engine/effects/interpreter/getActivationMemoryCost";
import { getDecisionEffectSummary } from "#api/engine/effects/interpreter/getDecisionEffectSummary";

function containsPlayCostReduction(actions: Action[]): boolean {
  return actions.some((action) => {
    if (action.kind === "ReducePlayCost") return true;
    if (action.kind === "CostModifier" && action.costType === "play" && action.mode === "reduce") return true;
    // Cost-gated bodies execute now; subscriptions and granted effects execute later.
    return action.kind === "CostGatedBlock" && containsPlayCostReduction(action.actions);
  });
}

type ReplacementAction = Extract<Action, { kind: "Replacement" }>;

function nestedPlayCostReductions(action: Action): ReplacementAction[] {
  if (action.kind !== "Replacement" || action.event !== "wouldBePlayed" || action.mode !== undefined) return [];
  return (action.actions ?? []).filter(
    (nested): nested is ReplacementAction =>
      nested.kind === "Replacement" && nested.event === "wouldBePlayed" && nested.mode === "reduceCost",
  );
}

function declaresPlayCostReduction(action: Action): boolean {
  return (
    (action.kind === "Replacement" && action.event === "wouldBePlayed" && action.mode === "reduceCost") ||
    nestedPlayCostReductions(action).length > 0
  );
}

function potentialNestedPlayCostReduction(
  nested: ReplacementAction[],
  ctx: Parameters<NonNullable<BuilderOptions["when"]>>[0],
): number {
  if (nested.some((reduction) => reduction.cost !== undefined || typeof reduction.amount !== "number")) return 0;
  return nested.reduce((total, reduction) => {
    if (typeof reduction.amount !== "number") return total;
    if (reduction.condition !== undefined && !evaluateCondition(ctx, reduction.condition)) return total;
    const scale = reduction.scaling === undefined ? 1 : scaleFactor(ctx, reduction.scaling);
    return total + Math.max(0, reduction.amount * scale);
  }, 0);
}

function potentialPlayCostReduction(
  actions: Action[],
  ctx: Parameters<NonNullable<BuilderOptions["when"]>>[0],
  target?: import("@aegis/shared").Permanent,
): number {
  return actions.reduce((total, action) => {
    if (action.kind !== "Replacement" || !declaresPlayCostReduction(action)) return total;
    if (
      target === undefined ||
      action.sourceFilter === undefined ||
      action.cost !== undefined ||
      !permanentMatchesFilter(ctx, target, action.sourceFilter, ctx.source)
    )
      return total;
    if (action.mode === undefined)
      return total + potentialNestedPlayCostReduction(nestedPlayCostReductions(action), ctx);
    const choices = action.amountChoices;
    if (choices === undefined) return total;
    const eligible = choices.filter(
      (choice) => choice.condition === undefined || evaluateCondition(ctx, choice.condition),
    );
    return total + Math.max(0, ...eligible.map((choice) => choice.amount));
  }, 0);
}

/** Preserve a collected conferral key while still giving nested effects their own identity. */
function runtimeEffectKey(ctx: Parameters<Effect["resolve"]>[0], effectKey: string): string {
  const collectedKey = ctx.activeEffectKey;
  return collectedKey?.startsWith(`${effectKey}/conferral/`) === true ? collectedKey : effectKey;
}

export function irCardModule(
  cardId: string,
  compiled: CompiledCard,
  snapshotNodes?: CompiledNodeRegistry,
): EffectModule {
  // A few legacy generated records encoded a shared clause as `trigger: [A, B]` even though the
  // public IR type is intentionally a single trigger. Normalize that shape into one effect per
  // timing so neither branch is silently routed to EffectTiming.None.
  const effects: CardEffect[] = compiled.effects.flatMap((effect) => {
    const trigger = (effect as CardEffect & { trigger?: unknown }).trigger;
    return Array.isArray(trigger)
      ? trigger.map((singleTrigger) => ({ ...effect, trigger: singleTrigger }) as CardEffect)
      : [effect];
  });
  // Explicit legacy Overclock bodies obey the same contract as synthesized ones.
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i]!;
    if (effect.trigger !== "EndOfYourTurn" || !effect.keywords?.some((k) => k.keyword === "Overclock")) continue;
    effects[i] = {
      ...effect,
      actions: effect.actions.map((action) =>
        action.kind === "Attack"
          ? {
              ...action,
              attackTargetScope: AttackTargetScope.PLAYER.value,
              attackMechanic: "Overclock",
              drainTimingWindowDuringAttack: true,
            }
          : action,
      ),
    };
  }
  const rootKeywords = (compiled as CompiledCard & { keywords?: CardEffect["keywords"] }).keywords ?? [];
  // Resident markers are separate keyword effects so a selective copy can omit one
  // without dropping sibling keywords or their numerical values.
  for (const [index, keyword] of rootKeywords.entries()) {
    effects.push({
      trigger: "Static",
      actions: [],
      keywords: [keyword],
      keywordEffect: keyword.keyword,
      effectKey: `${cardId}/keyword/${keyword.keyword}/${index}`,
    });
  }
  // ＜Training＞ compiles two ways depending on the runtime record path: either as `effect.keywords`
  // metadata on the printed-keyword line, or (the common case for EX9's Digimon, e.g. EX9-008/
  // EX9-016) as a self-targeted `GainKeyword` ACTION inside a Static effect. Checking only
  // `effect.keywords` missed every GainKeyword-shaped card, silently dropping the synthesized
  // activated ability (CR 16-41-1) for all of them.
  const printsTraining = compiled.effects.some(
    (e) =>
      e.isInherited !== true &&
      ((e.keywords ?? []).some((k) => k.keyword === "Training") ||
        (e.actions ?? []).some(
          (a) =>
            a.kind === "GainKeyword" &&
            (a as { keyword?: { keyword?: string } }).keyword?.keyword === "Training" &&
            ((a as { target?: { isSelf?: boolean } }).target?.isSelf ?? false),
        )),
  );
  if (printsTraining) {
    effects.push(trainingActivatedEffect());
    // CR 16-41 explicitly permits Training in breeding. Keep the existing Main
    // effect index and append its zone-specific counterpart.
    effects.push(trainingActivatedEffect(true));
  }
  const definition = getCardDefinition(cardId);
  const overclockTrait = synthesizedOverclockTrait(compiled, definition);
  if (declaresUnimplementedEngageKeyword(compiled)) effects.push(engageActivatedEffect());
  if (declaresExecuteKeyword(compiled)) {
    effects.push(executeActivatedEffect());
  }
  // Vortex can be granted dynamically by another permanent (for example BT26-045, P-241,
  // and BT21-095). Install the conditional trigger on every compiled Digimon so a live grant
  // receives the same end-of-turn attack scheduling as a printed keyword. The condition inside
  // vortexActivatedEffect re-checks the active keyword at resolution/collection time, so a
  // temporary grant naturally expires and a non-Vortex permanent contributes no effect.
  if (definition?.kinds.includes(CardKind.Digimon) === true && !hasExplicitVortexEndOfTurnAttack(compiled)) {
    effects.push(vortexActivatedEffect());
  }
  registerTamerOntoFromEffects(cardId, compiled.effects);
  collectWouldBePlayedSelfReducers(cardId, compiled.effects);
  collectWouldDigivolveSelfReducers(cardId, compiled.effects);
  registerDigisorptionFromEffects(cardId, compiled.effects);
  registerDigisorptionRedirectorFromEffects(cardId, compiled.effects);
  registerBlastDigivolveFromEffects(cardId, compiled.effects);
  detectAllowDigiXrosMaterialsFromTrash(cardId, compiled.effects);
  if (overclockTrait !== undefined) effects.push(overclockActivatedEffect(overclockTrait));
  snapshotNodes?.registerRoot({ cardId, rootKey: CompiledRootKind.MODULE.value, root: effects });
  const cardIsOption = definition !== undefined && isOption(definition);
  const effectCondition = (effect: CardEffect, ctx: Parameters<NonNullable<BuilderOptions["when"]>>[0]): boolean => {
    const result = effect.condition === undefined || evaluateCondition(ctx, effect.condition);
    return result;
  };
  // A condition that describes the FIRING EVENT itself ("when one of your Digimon's effects adds
  // cards to your hand") is part of the trigger, not of resolution: an event that does not match
  // must never collect the effect in the first place. Board-state conditions ("if you have a
  // Tamer") stay a resolution gate, where an effect still triggers and then does nothing.
  const triggerCondition = (effect: CardEffect, ctx: Parameters<NonNullable<BuilderOptions["when"]>>[0]): boolean =>
    effect.condition?.kind.startsWith("trigger") !== true || effectCondition(effect, ctx);
  // The on-play body is the FIRST ordinary (non-trash, non-security, non-＜Delay＞) [Main] of an Option — the one
  // play-card fires via OnUseOption. Only that clause is stripped of the OnDeclaration co-home (so
  // it cannot re-fire on the placed option permanent); later [Main] clauses stay activatable.
  let seenOptionPlayMain = false;
  const isPlainMain = (e: CardEffect): boolean =>
    e.trigger === "Main" && !e.isSecurity && !e.isFromTrash && !(e.keywords ?? []).some((kw) => kw.keyword === "Delay");
  // Pre-bucket effects by their target EffectTiming so effectsForTiming is O(1).
  const byTiming = new Map<EffectTiming, { effect: CardEffect; build: (o: BuilderOptions) => Effect }[]>();
  let index = 0;
  for (const effect of effects) {
    // The intrinsic keyword is consumed by GameEngine.payDigisorption through the side registry;
    // installing this marker as a Static replacement would make the evolved Digimon reduce the
    // NEXT digivolution too (BT3-054 -> BT3-056 regression).
    if (isIntrinsicDigisorptionMarker(effect)) continue;
    // A hand-resident self digivolution reducer is consumed by the digivolve cost path while the
    // card is still in hand; retaining its marker as a field Static replacement would discount a
    // later evolution after the card has entered play (BT17-048).
    if (isIntrinsicWouldDigivolveSelfReducerMarker(cardId, effect)) continue;
    if (isIntrinsicWouldBePlayedSelfReducerMarker(cardId, effect)) continue;
    const isOptionPlayBody = cardIsOption && isPlainMain(effect) && !seenOptionPlayMain;
    if (cardIsOption && isPlainMain(effect)) seenOptionPlayMain = true;
    const timings = timingsForTrigger(effect, isOptionPlayBody);
    if (timings.length === 0) continue;
    const build = builderForTrigger(effect);
    const activationMemoryCost = getActivationMemoryCost({ effect });
    const decisionSummary = getDecisionEffectSummary({ actions: effect.actions, cost: effect.cost });
    const markedBuild = (options: BuilderOptions): Effect => {
      const built = build(options);
      const onlyAction = effect.actions.length === 1 ? effect.actions[0] : undefined;
      const sacrifice =
        effect.cost === undefined &&
        onlyAction?.kind === "ReducePlayCost" &&
        onlyAction.payment.kind === "sacrificePermanent"
          ? onlyAction.payment.target
          : undefined;
      return {
        ...built,
        activationMemoryCost,
        decisionSummary,
        ...(effect.cost === undefined &&
        onlyAction !== undefined &&
        isDigiXrosPickerReplacement({ cardId, action: onlyAction })
          ? { canAttemptPlayCostReduction: () => false }
          : {}),
        ...(sacrifice === undefined
          ? {}
          : {
              canAttemptPlayCostReduction: (ctx: Parameters<Effect["resolve"]>[0]) =>
                candidatePermanents(ctx, sacrifice).length > 0,
            }),
        ...(containsPlayCostReduction(effect.actions) ? { isPlayCostReduction: true } : {}),
        ...(effect.actions.some(declaresPlayCostReduction)
          ? {
              potentialPlayCostReduction: (
                ctx: Parameters<NonNullable<BuilderOptions["when"]>>[0],
                target?: import("@aegis/shared").Permanent,
              ) => potentialPlayCostReduction(effect.actions, ctx, target),
            }
          : {}),
        ...(effect.keywordEffect !== undefined ? { keywordEffect: effect.keywordEffect } : {}),
      };
    };
    for (const timing of timings) {
      const list = byTiming.get(timing) ?? [];
      list.push({ effect, build: markedBuild });
      byTiming.set(timing, list);
    }
    index++;
  }
  void index;

  // Everything below depends only on the static IR entry, never on the source, and this
  // runs for every candidate card on every continuous pass, so it is derived once per entry.
  const staticsByEntry = new Map<string, EntryStatics>();
  function staticsFor(timing: EffectTiming, i: number, effect: CardEffect): EntryStatics {
    const cacheKey = `${timing}/${i}`;
    const cached = staticsByEntry.get(cacheKey);
    if (cached !== undefined) return cached;
    snapshotNodes?.registerRoot({ cardId, rootKey: CompiledRootKind.MODULE.value, root: effects, index: true });
    const effectKey =
      (effect as CardEffect & { effectKey?: string }).effectKey ??
      (effect.sharedUseKey !== undefined ? `${cardId}/${effect.sharedUseKey}` : `${cardId}/ir-${timing}-${i}`);
    const isDelay =
      (effect.keywords ?? []).some((kw) => kw.keyword === "Delay") ||
      (effect.actions ?? []).some(
        (action) =>
          (action.kind === "SubTrigger" || action.kind === "Replacement") &&
          ((action as Action & { keywords?: CardEffect["keywords"] }).keywords ?? []).some(
            (kw) => kw.keyword === "Delay",
          ),
      );
    const hasReactiveDelayAction = (effect.actions ?? []).some(
      (action) => action.kind === "SubTrigger" || action.kind === "Replacement",
    );
    const isMandatoryTrigger =
      timing !== EffectTiming.OnDeclaration &&
      effect.optional !== true &&
      (effect.actions ?? []).every((action) => (action as { optional?: boolean }).optional !== true);
    const frequencyBoundEffect = withSubTriggerTurnScope(withSubTriggerFrequency(effect, effectKey));
    const resolvedEffect = isDelay ? withIntrinsicDelayGate(frequencyBoundEffect) : frequencyBoundEffect;
    const statics: EntryStatics = {
      effectKey,
      isDelay,
      description: effect.description ?? describeEffect(effect),
      hasReactiveDelayAction,
      isMandatoryTrigger,
      resolvedEffect,
      continuousPriority: providesEffectImmunity(effect) ? -1 : readsSelfKeyword(effect) ? 1 : 0,
    };
    staticsByEntry.set(cacheKey, statics);
    snapshotNodes?.registerRoot({
      cardId,
      rootKey: getResolvedRootKey({ timing, index: i }),
      root: resolvedEffect,
      index: true,
    });
    return statics;
  }

  snapshotNodes?.setMaterializer({
    cardId,
    materialize: (rootKey) => {
      const parts = rootKey.split("/");
      if (parts.length !== 3 || parts[0] !== CompiledRootKind.RESOLVED.value) {
        return;
      }
      const timing = Number(parts[1]);
      const entryIndex = Number(parts[2]);
      if (!Number.isSafeInteger(timing) || !Number.isSafeInteger(entryIndex) || entryIndex < 0) {
        return;
      }
      const entry = byTiming.get(timing)?.[entryIndex];
      if (entry !== undefined) {
        staticsFor(timing, entryIndex, entry.effect);
      }
    },
  });
  return {
    cardId,
    hasTiming(timing: EffectTiming): boolean {
      return byTiming.has(timing);
    },
    effectsForTiming(timing: EffectTiming, source: CardSource): Effect[] {
      const entries = byTiming.get(timing);
      if (entries === undefined) return [];
      const materialized = entries.map(({ effect, build }, i) => {
        const {
          effectKey,
          isDelay,
          description,
          hasReactiveDelayAction,
          isMandatoryTrigger,
          resolvedEffect,
          continuousPriority,
        } = staticsFor(timing, i, effect);
        // ＜Delay＞ universal semantics: a Delay-keyworded [Main] clause is
        // routed here to OnDeclaration (timingForTrigger), where it becomes a "you may, by
        // trashing this card in your battle area, [payload]" activatable that "can't activate
        // the turn this card enters play". Inject those semantics for EVERY delay clause so the
        // whole Memory Boost family is correct without per-card cost/condition IR — the source
        // option (placed as a battle-area permanent by its on-play effect) is trashed as the
        // cost, then the payload runs.
        // A `sharedUseKey` makes several clauses (across different timings) share ONE per-turn use
        // ledger entry — the UseTracker keys on (instanceId, effectKey), so a stable key shared by
        // each clause collapses them to a single [Once Per Turn] limit (BT25-084's OP/WD/WA share).
        // The trash-to-activate Delay semantics apply to [Main] effects (routed to
        // OnDeclaration, below) AND to continuous-window triggers like AllTurns
        // (EffectTiming.None) — comprehensive rules §16-17-1 makes trashing the source card
        // the activation cost regardless of what event arms it. A Delay keyword on a
        // continuous trigger still installs its Replacement/SubTrigger as a staticModifier
        // (the reactive listener has to live as long as the card is in the battle area), but
        // the listener's OWN firing is gated by the same trash-cost + turn-guard as the
        // OnDeclaration case — see `withIntrinsicDelayGate` (CAP-E14 fix; BT19-099, BT20-100,
        // BT23-093). Previously this branch only guarded on `timing === OnDeclaration`, so the
        // continuous case ran unconditionally with no trash cost or turn-guard at all.
        if (isDelay && timing === EffectTiming.OnDeclaration) {
          return build({
            source,
            irTrigger: effect.trigger,
            effectKey,
            description,
            optional: true,
            isInherited: effect.isInherited ?? false,
            isLinked: effect.isLinked ?? false,
            isFromTrash: effect.isFromTrash,
            isFromHand: effect.isFromHand,
            maxPerTurn: effect.frequency === "OncePerTurn" ? 1 : -1,
            when: (ctx) => (turnOwnerGuard(effect.trigger)?.(ctx) ?? true) && effectCondition(effect, ctx),
            // "Can't activate the turn this card enters play" (CanDeclareOptionDelayEffect):
            // the source must still be a battle-area permanent that entered on an earlier turn.
            canActivate: (ctx) => {
              const self = ctx.source.permanent();
              const armedDelayAction = (effect.actions ?? []).find(
                (action) => "requiresDelayArmed" in action && action.requiresDelayArmed === true,
              );
              const hasArmedDelay =
                armedDelayAction !== undefined &&
                self !== undefined &&
                (ctx.fx.grantedKeywords?.(self.permanentId) ?? []).some((grant) => grant.keyword === "Delay");
              return (
                self !== undefined &&
                self.enterFieldTurnCount !== ctx.game.state.turnCount &&
                // Trashing the card is the ＜Delay＞ processing condition (CR 16-17-1/16-17-2),
                // and CR 15-7-5 lets a player pay it even when the payload cannot execute
                // (Q5710). So the payload's targets, bullet conditions and inner costs never
                // gate the declaration; only a clause-level condition does, matching `resolve`.
                (armedDelayAction !== undefined ? hasArmedDelay : effectCondition(effect, ctx))
              );
            },
            resolve: async (ctx) => {
              if (!effectCondition(effect, ctx)) return;
              // "By trashing this card" — trash the source Option permanent (the cost); only run
              // the payload if it was actually trashed.
              const self = ctx.source.permanent();
              if (self === undefined) return;
              const hasArmedDelayAction = (effect.actions ?? []).some(
                (action) => "requiresDelayArmed" in action && action.requiresDelayArmed === true,
              );
              let delayArmedConsumed = false;
              if (hasArmedDelayAction) {
                const hasDelay = (ctx.fx.grantedKeywords?.(self.permanentId) ?? []).some((g) => g.keyword === "Delay");
                if (!hasDelay) return;
                ctx.fx.revokeKeyword?.(self.permanentId, "Delay");
                delayArmedConsumed = true;
              }
              ctx.onActivationChosen?.();
              const trashed = await trashDelaySource(ctx, self);
              // A prevented/failed trash does not pay ＜Delay＞'s activation cost, so its
              // payload cannot resolve. A replacement may move the source before reporting
              // a zero-like result while still having paid the cost.
              if (trashed <= 0 && ctx.source.permanent() !== undefined) return;
              // The source is the activation cost. Trash it before resolving the payload so
              // state observers cannot see the Delay reward while the paid card remains in play.
              const outerEffectKey = ctx.activeEffectKey;
              ctx.activeEffectKey = runtimeEffectKey(ctx, effectKey);
              try {
                const resolutionContext = { ...ctx, delayArmedConsumed };
                await runEffect(resolutionContext, effect);
                if (effect.actions.length === 1 && effect.actions[0]?.kind === "Digivolve") {
                  ctx.digivolutionPerformed = resolutionContext.lastDigivolveResult === true;
                }
              } finally {
                ctx.activeEffectKey = outerEffectKey;
              }
            },
          });
        }
        // CAP-E14 follow-up: a ＜Delay＞ keyword on a DISCRETE windowed trigger
        // (StartOfYourTurn/EndOfOpponentsTurn/EndOfAllTurns/...) whose payload is a plain action
        // list — not a reactive SubTrigger/Replacement listener, which is `withIntrinsicDelayGate`'s
        // continuous-timing case below — still carries the same §16-17 semantics: the window only
        // offers the CHANCE to activate, gated by trashing the source card (§16-17-1, optional per
        // §16-17-2) and barred the turn the card entered play (§16-17-3). Without this branch the
        // window fired its payload unconditionally, with no cost and no turn-guard (LM-027..030's
        // Scramble family, EX10-072, P-193).
        if (isDelay && timing !== EffectTiming.None && !hasReactiveDelayAction) {
          return build({
            source,
            irTrigger: effect.trigger,
            effectKey,
            description,
            optional: effect.optional ?? false,
            isInherited: effect.isInherited ?? false,
            isLinked: effect.isLinked ?? false,
            isFromTrash: effect.isFromTrash,
            isFromHand: effect.isFromHand,
            maxPerTurn: effect.frequency === "OncePerTurn" ? 1 : effect.frequency === "TwicePerTurn" ? 2 : -1,
            when: (ctx) => (turnOwnerGuard(effect.trigger)?.(ctx) ?? true) && effectCondition(effect, ctx),
            // "Can't activate the turn this card enters play" (§16-17-3).
            canActivate: (ctx) => {
              const self = ctx.source.permanent();
              if (self === undefined || self.enterFieldTurnCount === ctx.game.state.turnCount) return false;
              return canActivateEffect(ctx, effect);
            },
            resolve: async (ctx) => {
              if (!effectCondition(effect, ctx)) return;
              // "By trashing this card" — trash the source permanent (the cost); only run the
              // payload if it was actually trashed. §16-17-2: the whole thing is optional.
              const self = ctx.source.permanent();
              if (self === undefined) return;
              const activate = await ctx.ask.optional(ctx, "Trash this card to activate its ＜Delay＞ effect?");
              if (!activate) return;
              const trashed = await trashDelaySource(ctx, self);
              if (trashed <= 0 && ctx.source.permanent() !== undefined) return;
              const outerEffectKey = ctx.activeEffectKey;
              ctx.activeEffectKey = runtimeEffectKey(ctx, effectKey);
              try {
                await runEffect(ctx, effect);
              } finally {
                ctx.activeEffectKey = outerEffectKey;
              }
            },
          });
        }
        // CAP-E14: a ＜Delay＞ keyword on a continuous-window trigger (AllTurns and siblings
        // mapping to EffectTiming.None) still installs its listener as a staticModifier, but
        // the listener body must apply Delay's own trash-cost + turn-guard when it fires —
        // see `withIntrinsicDelayGate`'s doc comment above.
        // CR 15-4-2: a MANDATORY triggered effect triggers even when its only board target is
        // missing, and fizzles at resolution. Optionality is printed either on the clause or on
        // an action ("you may delete 1 …"), and either form makes the empty-board prompt a UI
        // wart rather than a rules requirement, so both keep the declaration-time target gate.
        return build({
          source,
          irTrigger: effect.trigger,
          effectKey,
          description,
          timingOverride: effect.timingOverride,
          canCancelBeforeTargets: canCancelOptionalActivation({ effect: resolvedEffect }),
          activationTextEmphasis: getActivationTextEmphasis({ effect: resolvedEffect, description }),
          optional: effect.optional ?? false,
          isInherited: effect.isInherited ?? false,
          isLinked: effect.isLinked ?? false,
          attackScope: effect.attackScope,
          isFromTrash: effect.isFromTrash,
          isFromHand: effect.isFromHand,
          continuousPriority,
          // isSecurity is set by the `security` builder itself, not via options.
          maxPerTurn: effect.frequency === "OncePerTurn" ? 1 : effect.frequency === "TwicePerTurn" ? 2 : -1,
          when: (ctx) =>
            (turnOwnerGuard(effect.trigger)?.(ctx) ?? true) &&
            (timing === EffectTiming.BeforePayCost ? effectCondition(effect, ctx) : triggerCondition(effect, ctx)),
          canActivate: (ctx) =>
            (effect.trigger !== "WhenLinking" || ctx.trigger.linkedInstanceIds?.includes(source.instanceId) === true) &&
            canActivateEffect(ctx, effect, {
              collectsMandatoryTrigger: isMandatoryTrigger,
              collectsTriggeredEffect: timing !== EffectTiming.OnDeclaration && timing !== EffectTiming.None,
            }),
          resolve: async (ctx) => {
            const outerEffectKey = ctx.activeEffectKey;
            ctx.activeEffectKey = runtimeEffectKey(ctx, effectKey);
            try {
              await runEffect(ctx, resolvedEffect);
            } finally {
              ctx.activeEffectKey = outerEffectKey;
            }
          },
        });
      });
      if (snapshotNodes !== undefined) {
        materialized.forEach((effect, entryIndex) => {
          trackRuntimeEffect({
            effect,
            cardId,
            timing,
            index: entryIndex,
            source,
            definition: staticsFor(timing, entryIndex, entries[entryIndex]!.effect).resolvedEffect,
          });
        });
      }
      return materialized;
    },
  };
}

interface EntryStatics {
  effectKey: string;
  isDelay: boolean;
  description: string;
  hasReactiveDelayAction: boolean;
  isMandatoryTrigger: boolean;
  resolvedEffect: CardEffect;
  continuousPriority: number;
}

/**
 * Register a card from its compiled IR record via the existing registry. Returns
 * the module so callers can also reference it.
 *
 * Idempotent: a cardId already in the registry (reached via another import path —
 * the set barrel and the IR smoke-test entry both register the same generated cards,
 * and under Vitest's `isolate: false` test files share one module graph) returns the
 * existing module instead of re-registering. Card ids are unique by construction
 * mask a genuine conflict between two distinct IR cards. `registerCard` still throws
 * for a hand-written double-port that does not go through this bulk path.
 */
export function registerIrCard(cardId: string, compiled: CompiledCard): EffectModule {
  const normalized = freezeCompiledCard({ compiled: normalizeCompiledCard(compiled) });
  registeredCompiledCardFingerprints.markImmutable({ compiled: normalized });
  // The direct card module is the executable IR authority. Keep the shared structural
  // requirement readers (DigiXros/digivolution/fusion and client projections) on that same
  // normalized record instead of the older generated effects.json snapshot.
  compiledEffects[cardId] = normalized;
  registeredCompiledCards.set(cardId, normalized);
  runtimeCompiledNodeRegistry.resetCard(cardId);
  runtimeCompiledNodeRegistry.registerRoot({ cardId, rootKey: CompiledRootKind.CATALOG.value, root: normalized });
  const existing = getEffectModule(cardId);
  const previousIrModule = registeredIrModules.get(cardId);
  // Registry precedence belongs to the concrete module, not merely to the fact that IR for
  // this card id was seen before. A handwritten override can be present before the first IR
  // import, or replace an IR module later in a shared Vitest graph; repeated IR imports must
  // preserve it in both cases.
  if (existing !== undefined && existing !== previousIrModule) return existing;
  if (existing !== undefined) unregisterCard(cardId);
  // The catalog keeps the authored record; only the runtime module carries the printed
  // clauses matched to each effect and watcher.
  const module = irCardModule(cardId, withPrintedClauses(cardId, normalized), runtimeCompiledNodeRegistry);
  registerCard(module);
  registeredIrModules.set(cardId, module);
  return module;
}

type ResolvedRootKeyParams = { timing: EffectTiming; index: number };

function getResolvedRootKey({ timing, index }: ResolvedRootKeyParams): string {
  return `${CompiledRootKind.RESOLVED.value}/${timing}/${index}`;
}
