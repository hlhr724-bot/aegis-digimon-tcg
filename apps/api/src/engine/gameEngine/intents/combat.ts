import type { CounterChoice } from "@aegis/shared/protocol/CounterChoice";
import { EffectTiming, type CardInstance, type IntentResult, type Seat } from "@aegis/shared";
import { effectiveNames } from "../../effects/continuous.js";
import { blastDnaChoices } from "../../actions/blastDnaDigivolve.js";
import { canActivate, canTrigger } from "../../effects/kernel.js";
import { effectsOf } from "../../effects/collect.js";
import { hasBlastDigivolveKeyword } from "../../effects/interpreter.js";
import { logError } from "../../../logger.js";
import {
  applyAttack,
  applyDigivolve,
  applyRespondCounter,
  type AttackIntent,
  type DigivolveIntent,
  type RespondCounterIntent,
  validateDigivolve,
  validateRespondCounter,
} from "../../actions/index.js";
import {
  attackDeps,
  digivolveDeps,
  dnaDigivolveDeps,
  effectiveDnaMaterialDefinition,
  respondCounterDeps,
} from "../actionDeps.js";
import type { GameEngine } from "../../GameEngine.js";
import { buildEffectContext, cardSourceOf } from "../effectContext.js";
import { checkTurnEndAfterVerb, isNewlyPlayedRushAttacker } from "./turnEnd.js";

/** Once memory has crossed, only a Rush attacker whose play crossed it may still attack. */
export function handleAttack(engine: GameEngine, seat: Seat, intent: AttackIntent): IntentResult {
  if (engine.memory.hasCrossedToOpponent() && !isNewlyPlayedRushAttacker(engine, intent.attackerPermanentId)) {
    return { ok: false, reason: engine.state.pendingDecision ? "decision-pending" : "wrong-phase" };
  }
  const deps = attackDeps(engine);
  const result = applyAttack(
    {
      ...deps,
      onCombatComplete: () => {
        engine.crossedMemoryRushAttackers.delete(intent.attackerPermanentId);
        engine.projection.syncAttackTargets();
        // Combat moves memory, so what the hand can afford moved with it.
        engine.projection.syncHandAffordances();
        checkTurnEndAfterVerb(engine);
        engine.hooks.onActionSettled?.(seat, "attack");
      },
    },
    seat,
    intent,
  );
  return result;
}

/**
 * Route the respondCounter verb (subsystem: attack-and-block; §11-3 Counter
 * Timing). Validates synchronously for the immediate IntentResult; on success
 * runs the chosen [Counter] effect (if any) as a continuation, mirroring
 * handleActivateEffect — but unlike a turn-player verb, does NOT run
 * `checkTurnEndAfterVerb` (engine fires mid-attack, for the defending seat; the
 * sibling combat-decision verbs in combatDecisions.ts don't run it either).
 */
export function handleRespondCounter(engine: GameEngine, seat: Seat, intent: RespondCounterIntent): IntentResult {
  // Counter processing must finish before another response can pass or activate in engine window.
  if (engine.counterResolutionInFlight) return { ok: false, reason: "decision-pending" };
  if (intent.sourceInstanceId !== undefined && intent.effectKey?.startsWith("blast-dna-digivolve:") === true) {
    if (!engine.combat.hasOpenCounterWindow) return { ok: false, reason: "wrong-phase" };
    if (engine.combat.counterWindowSeat !== seat) return { ok: false, reason: "not-your-turn" };
    if (engine.combat.counterActivationsRemaining <= 0) return { ok: false, reason: "illegal-target" };
    if (engine.state.pendingDecision !== undefined) return { ok: false, reason: "decision-pending" };
    // Recompute against live zones, names and restrictions before consuming either material.
    const choice = blastDnaCounterChoices(engine, seat).find(
      (entry) => entry.instanceId === intent.sourceInstanceId && entry.effectKey === intent.effectKey,
    );
    if (choice === undefined) return { ok: false, reason: "illegal-target" };
    engine.counterResolutionInFlight = true;
    void engine.primitives
      .dnaDigivolveInto([choice.materialPermanentId], choice.instanceId, {
        payCost: false,
        extraMaterialInstanceIds: [choice.handMaterialInstanceId],
        extraMaterialsOnBottom: choice.extraMaterialsOnBottom,
      })
      .then((result) => {
        if (result === undefined) throw new Error("invalid-evolution");
        engine.combat.resolveCounterActivated(seat);
        engine.hooks.emit({
          kind: "effectActivated",
          seat,
          sourceCardId: result.topCard!.cardId,
          effectKey: choice.effectKey,
          description: choice.description,
        });
      })
      .catch((err) => {
        logError("[engine] Blast DNA Digivolve apply failed:", err);
        engine.hooks.emit({
          kind: "actionRejected",
          intent: "respondCounter",
          reason: err instanceof Error ? err.message : "blast-dna-digivolve-apply-error",
        });
      })
      .finally(() => {
        engine.counterResolutionInFlight = false;
      });
    return { ok: true };
  }
  if (intent.sourceInstanceId !== undefined && intent.effectKey?.startsWith("blast-digivolve:") === true) {
    if (!engine.combat.hasOpenCounterWindow) return { ok: false, reason: "wrong-phase" };
    if (engine.combat.counterWindowSeat !== seat) return { ok: false, reason: "not-your-turn" };
    if (engine.combat.counterActivationsRemaining <= 0) return { ok: false, reason: "illegal-target" };
    const eligible = counterEligibleSources(engine, seat).find(
      (entry) => entry.instanceId === intent.sourceInstanceId && entry.effectKey === intent.effectKey,
    );
    if (eligible === undefined) return { ok: false, reason: "illegal-target" };
    const permanentId = intent.effectKey.slice("blast-digivolve:".length);
    const blastIntent: DigivolveIntent = {
      type: "digivolve",
      permanentId,
      instanceId: intent.sourceInstanceId,
      useBlastDigivolve: true,
    };
    const deps = digivolveDeps(engine);
    engine.counterResolutionInFlight = true;
    void applyDigivolve(engine.state, seat, blastIntent, deps)
      .then((outcome) => {
        if (!outcome.ok) throw new Error(outcome.reason);
        engine.combat.resolveCounterActivated(seat);
        engine.hooks.emit({
          kind: "effectActivated",
          seat,
          sourceCardId: outcome.outcome.newTopCardId,
          effectKey: intent.effectKey!,
          description: eligible.description,
        });
      })
      .catch((err) => {
        logError("[engine] Blast Digivolve apply failed:", err);
        engine.hooks.emit({
          kind: "actionRejected",
          intent: "respondCounter",
          reason: err instanceof Error ? err.message : "blast-digivolve-apply-error",
        });
      })
      .finally(() => {
        engine.counterResolutionInFlight = false;
      });
    return { ok: true };
  }
  const deps = respondCounterDeps(engine);
  const check = validateRespondCounter(seat, intent, deps);
  if (!check.ok) {
    return { ok: false, reason: check.reason };
  }
  engine.counterResolutionInFlight = true;
  void applyRespondCounter(seat, intent, deps)
    .then((outcome) => {
      if (outcome.ok && !outcome.outcome.pass) {
        engine.hooks.emit({
          kind: "effectActivated",
          seat,
          sourceCardId: outcome.outcome.sourceCardId,
          effectKey: outcome.outcome.effectKey,
          description: outcome.outcome.description,
        });
      }
    })
    .catch((err) => {
      logError("[engine] respondCounter apply failed:", err);
      engine.hooks.emit({
        kind: "actionRejected",
        intent: "respondCounter",
        reason: err instanceof Error ? err.message : "respond-counter-apply-error",
      });
    })
    .finally(() => {
      engine.counterResolutionInFlight = false;
    });
  return { ok: true };
}

/**
 * List `seat`'s currently-activatable [Counter] effects (§11-3-1), one entry per
 * (source instance, effect) pair. Mirrors `syncActivatableEffects` but scoped to
 * one (defending) seat and `EffectTiming.OnCounterTiming` rather than the turn
 * player and `ACTIVATE_TIMING`. Both battle-area Counter effects and explicit
 * `[Hand][Counter]` effects are eligible. Bound into `CombatController`'s
 * `counterEligible` hook so `runCounterWindow` can skip the round trip when nothing is eligible.
 */
export function counterEligibleSources(engine: GameEngine, seat: Seat): CounterChoice[] {
  const player = engine.state.players[seat];
  if (player === undefined) return [];
  const entries: CounterChoice[] = [];
  for (const perm of player.battleArea) {
    const candidates = [perm.topCard, ...perm.stack, ...perm.linked].filter((c): c is CardInstance => c !== undefined);
    for (const instance of candidates) {
      const source = cardSourceOf(engine, instance);
      for (const effect of effectsOf(EffectTiming.OnCounterTiming, source)) {
        const ctx = buildEffectContext(engine, source, {});
        if (canTrigger(effect, ctx, engine.tracker) && canActivate(effect, ctx, engine.tracker)) {
          entries.push({
            instanceId: instance.instanceId,
            effectKey: effect.effectKey,
            description: effect.description,
            sourceCardId: instance.cardId,
            ...(effect.decisionSummary === undefined ? {} : { summary: effect.decisionSummary }),
          });
        }
      }
    }
  }
  for (const instance of player.hand) {
    const source = cardSourceOf(engine, instance);
    for (const effect of effectsOf(EffectTiming.OnCounterTiming, source)) {
      const ctx = buildEffectContext(engine, source, {});
      if (canTrigger(effect, ctx, engine.tracker) && canActivate(effect, ctx, engine.tracker)) {
        entries.push({
          instanceId: instance.instanceId,
          effectKey: effect.effectKey,
          description: effect.description,
          sourceCardId: instance.cardId,
          ...(effect.decisionSummary === undefined ? {} : { summary: effect.decisionSummary }),
        });
      }
    }
  }
  entries.push(...blastDnaCounterChoices(engine, seat));
  const blastDeps = { ...digivolveDeps(engine), blastWindowAllowed: () => true };
  for (const instance of player.hand) {
    if (!hasBlastDigivolveKeyword(instance.cardId)) continue;
    for (const permanent of player.battleArea) {
      const intent: DigivolveIntent = {
        type: "digivolve",
        permanentId: permanent.permanentId,
        instanceId: instance.instanceId,
        useBlastDigivolve: true,
      };
      if (!validateDigivolve(engine.state, seat, intent, blastDeps).ok) continue;
      entries.push({
        instanceId: instance.instanceId,
        effectKey: `blast-digivolve:${permanent.permanentId}`,
        description: "＜Blast Digivolve＞",
        sourceCardId: instance.cardId,
      });
    }
  }
  return entries;
}

export function blastDnaCounterChoices(engine: GameEngine, seat: Seat) {
  const deps = dnaDigivolveDeps(engine);
  return blastDnaChoices(engine.state, seat, {
    names: (permanent, definition) => effectiveNames(engine.continuous, permanent, definition.nameEn),
    restricted: (permanent, definition) => deps.materialsRestricted?.(engine.state, [permanent], definition) === true,
    effectiveMaterialDefinition: (permanent, result) => effectiveDnaMaterialDefinition(engine, permanent, result),
    matchingCost: deps.matchingCost,
  });
}
