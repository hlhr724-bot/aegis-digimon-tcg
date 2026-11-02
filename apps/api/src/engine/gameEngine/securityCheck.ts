import { observeEffectActivation } from "../effects/activationPresentation.js";
import { CardKind, EffectTiming, type CardInstance, type ServerEvent, type Seat } from "@aegis/shared";
import { resolveKeywords } from "../combat/keywords.js";
import {
  runSecurityCheck,
  type SecurityCheckDeps,
  type SecurityCheckOptions,
  type SecurityCheckReason,
} from "../security/index.js";
import { lookupDefinition } from "../cards/cardData.js";
import { canActivate, canTrigger } from "../effects/kernel.js";
import { buildResolutionEnv, resolveTiming } from "../effects/index.js";
import { effectsOf } from "../effects/collect.js";
import type { CollectedEffect } from "../effects/collect.js";
import type { TriggerInfo, SubTriggerEventName } from "../effects/EffectContext.js";
import { log } from "../../logger.js";
import type { GameEngine } from "../GameEngine.js";
import { resolutionDeps } from "./actionDeps.js";
import {
  armedSubTriggers,
  nestedTriggerSourceStillResident,
  parkedEntryCollected,
  pendingWindowCollected,
} from "./subTriggers.js";
import {
  beginResolvingWindow,
  collectDeferredTimingPending,
  endResolvingWindow,
  flushDeferredSecurityRemovalTriggers,
  flushDeferredTimingWindows,
  parkDeferredSecurityRemovalTriggers,
  withPendingPoolDrain,
  withTriggeredMutations,
} from "./windows.js";
import { buildEffectContext, cardSourceOf, effectEnvironment } from "./effectContext.js";
import { beginBattleScope, endBattleScope, sweepBattleDurations } from "./turnFlow.js";

export async function engineRunSecurityCheck(
  engine: GameEngine,
  defenderSeat: Seat,
  attackerPermanentId: string,
  reason: SecurityCheckReason = "attack",
  options: SecurityCheckOptions = {},
): Promise<void> {
  // Re-derive the continuous tier at the start of the live security battle so the
  // continuous ModifySecurityDP (ST3-12's [Opponent's Turn] +2000) is re-applied under its
  // guard before any securityCardDp read — the deferred IR-01 fix. recomputeContinuousEffects
  // clears the securityDp ledger itself, so engine is a single, fresh re-application rather than
  // a one-shot stale value left from an earlier window.
  await engine.recomputeContinuousEffects();
  const deps: SecurityCheckDeps = {
    beginBattleScope: () => beginBattleScope(engine),
    sweepEndOfBattle: (scopeId) => sweepBattleDurations(engine, scopeId),
    endBattleScope: (scopeId) => endBattleScope(engine, scopeId),
    recomputeContinuousEffects: () => engine.recomputeContinuousEffects(),
    // Strike = the number of security cards checked: base 1 plus every ＜Security
    // Attack +N＞ granted to the attacker. The securityAttack IR producer writes these
    // grants into continuous.keywordGrants; engine is the consuming read (Permanent.Strike,
    // source documented behavior). The floor stays at 1 (no grant ⇒ check 1 card).
    strikeFor: (attacker) => {
      // inversion is active on the attacker, each existing ＜Security Attack ±N＞ grant has its
      // amount NEGATED per-instance before summing (two ＜SA -1＞ → two ＜SA +1＞ = +2 to the
      // strike, NOT ＜SA +2＞ recomputed). The sign is applied per grant inside the reduce, so the
      // composition is faithful to the per-instance flip with no per-permanent value math.
      return engine.projection.securityStrikeFor(attacker.permanentId);
    },
    permanentById: (permanentId) => engine.access.permanentById(permanentId),
    isBattleAreaDigimon: (permanentId) =>
      engine.access.isBattleAreaDigimon(engine.access.permanentById(permanentId), engine.continuous),
    fireTiming: async (timing, info) =>
      engine.fireTiming(timing, {
        attackerPermanentId: info.attackerPermanentId,
        securityInstanceId: info.securityInstanceId,
        removedFromSecuritySeat: info.removedFromSecuritySeat,
      }),
    fireSubTrigger: async (event, info) =>
      engine.fireSubTrigger(event, {
        attackerPermanentId: info.attackerPermanentId,
        securityInstanceId: info.securityInstanceId,
        removedFromSecuritySeat: info.removedFromSecuritySeat,
        subjectPermanentId: info.subjectPermanentId,
      }),
    prepareCheckTriggers: (info) => {
      const payload: TriggerInfo = {
        securityRemovalEventId: ++engine.securityRemovalEventSeq,
        attackerPermanentId: info.attackerPermanentId,
        securityInstanceId: info.securityInstanceId,
        removedFromSecuritySeat: info.defenderSeat,
      };
      const events: SubTriggerEventName[] = info.wasAlreadyFaceUp
        ? ["whenCheckedFaceUpSecurity", "whenSecurityRemoved"]
        : ["whenSecurityRemoved"];
      const armed = events.flatMap((name) =>
        armedSubTriggers(engine, [...engine.subTriggers.subscriptionsFor(name)], payload),
      );
      const framework = effectEnvironment(engine, payload);
      const initialEnv = buildResolutionEnv(framework, resolutionDeps(engine));
      const initial = [
        ...initialEnv.collect(EffectTiming.OnSecurityCheck),
        ...initialEnv.collect(EffectTiming.OnLoseSecurity),
      ];
      // Effects parked while the [Security] effect resolves are derived from it.
      const parkedBeforeSecurityEffect = new Set(engine.pendingNestedTimingEffects);
      const watchersParkedBeforeSecurityEffect = new Set(engine.parkedEntrySubTriggers);
      const securityRemovalsBeforeEffect = new Set(engine.deferredSecurityRemovalTriggers);
      const outermost = beginResolvingWindow(engine);
      return async () => {
        parkDeferredSecurityRemovalTriggers(engine, securityRemovalsBeforeEffect);
        const enclosing = engine.pendingWindowSubTriggers;
        engine.pendingWindowSubTriggers = [...enclosing, ...armed];
        engine.subTriggerWindowDepth += 1;
        try {
          await withTriggeredMutations(engine, async () => {
            // This checkpoint snapshots its printed triggers below. Keep newly derived
            // rule/deletion reactions visible even when those collectors replace env.collect.
            const reactionPending: CollectedEffect[] = collectDeferredTimingPending(engine);
            const env = buildResolutionEnv(
              framework,
              resolutionDeps(engine, () => [], { outermost, reactionPending }),
            );
            const derivedFromSecurityEffect = (): CollectedEffect[] => [
              ...reactionPending,
              ...engine.pendingNestedTimingEffects.filter(
                (pending) =>
                  !parkedBeforeSecurityEffect.has(pending) && nestedTriggerSourceStillResident(engine, pending),
              ),
              ...parkedEntryCollected(engine, watchersParkedBeforeSecurityEffect),
            ];
            await withPendingPoolDrain(engine, outermost, async () => {
              // CR §15-4-5-2/3: the [Security] effect's derived triggers activate before the
              // watchers already pending when the check began, whichever seat owns them.
              if (derivedFromSecurityEffect().length > 0) {
                await resolveTiming(EffectTiming.OnSecurityCheck, {
                  ...env,
                  collect: derivedFromSecurityEffect,
                });
              }
              await resolveTiming(EffectTiming.OnSecurityCheck, {
                ...env,
                collect: () => [...initial, ...pendingWindowCollected(engine), ...reactionPending],
              });
            });
            if (outermost) {
              await flushDeferredTimingWindows(engine);
              await flushDeferredSecurityRemovalTriggers(engine);
            }
          });
          await engine.recomputeContinuousEffects();
        } finally {
          engine.pendingWindowSubTriggers = enclosing;
          engine.subTriggerWindowDepth -= 1;
          // A nested check (an attack declared inside a resolving effect) folds the ENCLOSING
          // window's pending watchers into its own ordering. Those watchers stay queued in the
          // enclosing window, so their consumed identities must outlive engine inner window or the
          // enclosing collect fires them a second time (BT26-086: link seven, then attack).
          if (outermost && engine.subTriggerWindowDepth === 0) engine.consumedSubTriggerKeys.clear();
          endResolvingWindow(engine, outermost);
        }
      };
    },
    resolveSecurityEffect: async (card, resolvingAttackerId, wasFaceUp) =>
      resolveSecurityEffect(engine, card, resolvingAttackerId, wasFaceUp),
    // Reveal hint only: true whenever the card HAS a [Security] effect that would
    // activate, even if that effect later declines to do anything. The client uses it to
    // dock the card while the effect resolves, matching the reference client.
    hasSecurityEffect: (card, hintAttackerId, wasFaceUp) =>
      securityEffectsFor(engine, card, hintAttackerId, wasFaceUp).length > 0,
    dpOf: (permanentId) => engine.access.permanentById(permanentId)?.currentDP ?? 0,
    hasKeyword: (permanentId, keyword) => {
      const permanent = engine.access.permanentById(permanentId);
      return permanent !== undefined && resolveKeywords(permanent, engine.continuous).includes(keyword);
    },
    hasRestriction: (permanentId, restriction) => engine.continuous.hasRestriction(permanentId, restriction),
    securityCardDp: (card) => {
      const owner = card.ownerSeat;
      return (lookupDefinition(card.cardId)?.dp ?? 0) + engine.securityDp.deltaFor(owner);
    },
    isDigimon: (card) => {
      const result = engine.access.isDigimonCard(card);
      log("[securityCheck]", card.cardId, `isDigimon=${result} kinds=`, lookupDefinition(card.cardId)?.kinds);
      return result;
    },
    deletePermanents: async (permanentIds, afterMovement) => {
      // Security battles use the authoritative deletion primitive too. It owns the complete
      // replacement pipeline (Armor Purge, Decoy, Material Save, On Deletion and teardown),
      // preventing engine seam from drifting from field-battle and effect deletion behavior.
      await engine.primitives.deletePermanent(permanentIds, "byBattle", { afterMovement });
    },
  };
  const emitWithLog = (event: ServerEvent) => {
    engine.hooks.emit(event);
    if (event.kind === "securityChecked") {
      log("[securityCheck]", "securityChecked event:", JSON.stringify(event));
    }
  };
  engine.securityCheckDepth += 1;
  try {
    await runSecurityCheck(
      engine.state,
      emitWithLog,
      engine.win,
      deps,
      defenderSeat,
      { permanentId: attackerPermanentId },
      reason,
      options,
    );
  } finally {
    engine.securityCheckDepth -= 1;
  }
}

/**
 * Resolve a revealed security card's [Security] effect, if it has one (subsystem:
 * effect-stack-resolution + effect-framework). Looks up the card's registered
 * module for effects filed under {@link EffectTiming.SecuritySkill}; if any
 * trigger, it runs them through the same ordered stack resolver every other timing
 * uses (scoped to engine one card so only its security effect fires). Returns true
 * when at least one security effect ACTUALLY activated: an effect that could not
 * activate, or an optional the owner declined, leaves the card to be trashed as if it
 * had no security effect (KB Q886).
 *
 * The checked card has already left security (CR 13-1-6). Exact source lookup and
 * [Security] self-relocation use its temporary checked-card context.
 *
 * Resolved as a single ordered pass over the card's own security effects rather
 * than through the re-collecting `runTiming` fixpoint: a [Security] effect
 * activates once when the card is flipped (the source activates the single
 * security skill), and the card leaves the security zone as part of resolving, so
 * a re-collection of the same instance must not re-offer it.
 */
export async function resolveSecurityEffect(
  engine: GameEngine,
  card: CardInstance,
  attackerPermanentId: string,
  securityWasFaceUp?: boolean,
): Promise<boolean> {
  const securityEffects = securityEffectsFor(engine, card, attackerPermanentId, securityWasFaceUp);
  log(
    "[resolveSecurityEffect]",
    card.cardId,
    `found ${securityEffects.length} effect(s)`,
    securityEffects.map((e) => ({ key: e.effectKey, optional: e.optional, desc: e.description })),
  );
  if (securityEffects.length === 0) return false;

  const source = cardSourceOf(engine, card);
  const def = lookupDefinition(card.cardId);

  // A DUAL card's [Security] clause printed on its Digimon face resolves as a
  // Digimon effect (BT26-075 Q7102), even though the physical card is also an
  // Option for security-effect suppression (Q7103). Keep those two rule queries
  // separate: the disable above reads the full definition, while effect provenance
  // below uses only the face that owns the resolving clause.
  const securityEffectSourceKinds =
    def?.isDualCard === true && def.effectText?.includes("[Security]") === true
      ? [CardKind.Digimon]
      : [...(def?.kinds ?? source.definition.kinds)];
  // KB Q886: an Option whose [Security] effect could not activate (condition unmet) or
  // whose optional was declined is simply trashed — nothing activated, so the check must
  // not report an "effect" resolution.
  let activated = false;
  for (const effect of securityEffects) {
    const ctx = {
      // Preserve Security provenance for both the real no-area check and direct timing
      // probes, which may still stage their source in a security fixture.
      ...buildEffectContext(engine, source, { securityWasFaceUp }),
      activeTiming: "SecuritySkill",
      effectSourceKinds: securityEffectSourceKinds,
    };
    if (!canActivate(effect, ctx, engine.tracker)) {
      log("[resolveSecurityEffect]", card.cardId, `canActivate=false for ${effect.effectKey}, skipping`);
      continue;
    }
    if (effect.optional && !(await engine.resolverDecisions.askOptional(source.ownerSeat, { source, effect }))) {
      log("[resolveSecurityEffect]", card.cardId, `optional declined for ${effect.effectKey}`);
      continue;
    }
    log("[resolveSecurityEffect]", card.cardId, `resolving ${effect.effectKey}`);
    // The [Security] clause is a triggered effect like any other, so it announces itself
    // the same way: the client reads the clause out of the left notice column beside the
    // revealed card. `resolveSecurityEffect` runs inside `securityCheckDepth`, so the
    // stamp below marks the announcement for the client's hold-until-reveal queue.
    const presentation = observeEffectActivation(ctx, effect.activationDeferred === true && !effect.optional, () => {
      engine.hooks.emit({
        kind: "effectTriggered",
        seat: source.ownerSeat,
        sourceCardId: source.cardId,
        sourceInstanceId: source.instanceId,
        sourcePermanentId: source.permanent()?.permanentId,
        effectKey: effect.effectKey,
        description: effect.description,
        timing: "Security",
        ...(effect.isInherited ? { isInherited: true } : {}),
        ...(engine.securityCheckDepth > 0 ? { duringSecurityCheck: true } : {}),
      });
    });
    ctx.fx.enterEffectResolution?.(source.ownerSeat, securityEffectSourceKinds);
    try {
      await withPendingPoolDrain(engine, true, () => effect.resolve(ctx));
    } finally {
      ctx.fx.leaveEffectResolution?.();
      presentation.restore();
    }
    if (presentation.accepted())
      engine.hooks.emit({
        kind: "effectResolved",
        seat: source.ownerSeat,
        sourceCardId: source.cardId,
        sourceInstanceId: source.instanceId,
        sourcePermanentId: source.permanent()?.permanentId,
        effectKey: effect.effectKey,
        description: effect.description,
        timing: "Security",
        ...(effect.isInherited ? { isInherited: true } : {}),
      });
    engine.tracker.register(source.instanceId, effect.effectKey);
    activated = true;
  }
  log("[resolveSecurityEffect]", card.cardId, `returning ${activated}`);
  return activated;
}

/**
 * The [Security] effects of `card` that would activate under engine attacker right now —
 * the shared lookup behind both {@link resolveSecurityEffect} and the
 * `hasSecurityEffect` reveal hint, so the hint can never disagree with what resolves.
 *
 * Security-effect disable (DisableSecurityEffect, the security half of the source rule
 * implementation split): while the attacker carries the disable, engine flipped card's
 * {Security} effect does not activate at all. Reporting none lets the security loop trash
 * an Option (KB Q886) and battle a Digimon normally.
 */
export function securityEffectsFor(
  engine: GameEngine,
  card: CardInstance,
  attackerPermanentId: string,
  securityWasFaceUp?: boolean,
): ReturnType<typeof effectsOf> {
  const source = cardSourceOf(engine, card);
  const def = lookupDefinition(card.cardId);
  if (def !== undefined && engine.continuous.isSecurityEffectDisabled(attackerPermanentId, def)) {
    log("[securityEffectsFor]", card.cardId, "SECURITY EFFECT DISABLED by attacker", attackerPermanentId);
    return [];
  }
  return effectsOf(EffectTiming.SecuritySkill, source).filter((effect) => {
    const ctx = buildEffectContext(engine, source, { securityWasFaceUp });
    return canTrigger(effect, ctx, engine.tracker);
  });
}

export async function payBarrierSecurityCost(engine: GameEngine, seat: Seat, interruptsEffect: boolean): Promise<void> {
  // Attack steps have their own interrupting windows. A direct battle inside another
  // effect instead keeps removal reactions pending until that effect finishes (#5235).
  const previous = engine.resolvingBarrierSecurityCost;
  engine.resolvingBarrierSecurityCost = interruptsEffect;
  try {
    await engine.primitives.trashFromSecurity(seat, 1, { fromTop: true, cause: "barrierCost" });
  } finally {
    engine.resolvingBarrierSecurityCost = previous;
  }
}
