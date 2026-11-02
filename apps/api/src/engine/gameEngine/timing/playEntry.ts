import { isTimingActivationDisabled } from "../../effects/timingActivation.js";
import { EffectTiming, Permanent, type Seat, type ZoneRef } from "@aegis/shared";
import { definitionOf } from "../../cards/cardData.js";
import { canActivate, canTrigger } from "../../effects/kernel.js";
import { effectsOf, type CollectedEffect } from "../../effects/collect.js";
import { effectProvenanceKinds } from "#api/engine/effects/effectProvenance";
import type { EffectContext, TriggerInfo } from "../../effects/EffectContext.js";
import { digivolvedFromTamerBase } from "../subTriggerIdentity.js";
import { findInstance } from "../intents.js";
import type { GameEngine } from "../../GameEngine.js";
import { withPendingSubTriggers } from "../subTriggers.js";
import { collectRuleProcessPending, hasRuleProcessPending } from "../ruleProcess.js";
import { shouldDeferNestedTiming } from "../windows.js";
import { buildEffectContext, cardSourceOf } from "../effectContext.js";

/**
 * The entry windows one PLAY opens, as a single pool: the played card's own [On Play], the
 * board-wide enter-field window, and every armed `whenPlayed` watcher ("when you play a green
 * Tamer, draw 1"). Shared by every play seam (playCard, DigiXros, Assembly) so they sequence
 * identically. Only `OnPlay` carries the board-wide half; any other timing just fires scoped.
 *
 * The pool is snapshotted from the board as it is when the card ENTERS, which is when those
 * triggers are determined. The trailing bus resolves only that snapshot: a watcher gained
 * during engine play's windows did not exist when the event happened (BT13-013, Q2272).
 */
export async function firePlayEntryWindows(
  engine: GameEngine,
  timing: EffectTiming,
  sourceInstanceId: string,
  scopedTrigger: TriggerInfo = {},
  opts: { deferWhenPlayed?: boolean; procedurePending?: readonly CollectedEffect[] } = {},
): Promise<void> {
  // Whatever a play-cost deletion or an interrupt inside the play procedure triggered rides
  // into engine play's own window (Q5131; CR §15-4-3-2, §15-8-3-2).
  const costDeletionEffects = [...engine.pendingPlayCostDeletionEffects.splice(0), ...(opts.procedurePending ?? [])];
  if (timing !== EffectTiming.OnPlay) {
    await engine.fireTimingForInstance(timing, sourceInstanceId, scopedTrigger, costDeletionEffects);
    return;
  }
  const entryPermanentId = findInstance(engine, sourceInstanceId)?.permanent?.permanentId;
  const playedEventTrigger = {
    ...playedTrigger(engine, entryPermanentId),
    ...scopedTrigger,
    entryCause: "play" as const,
  };
  if (entryPermanentId !== undefined) {
    materializePlayerCustomEffects(engine, engine.access.permanentById(entryPermanentId));
  }
  // The played card is already in the battle area when its play event happens, so its
  // resident `whenPlayed` watchers are eligible to trigger on that same event (BT25-028;
  // BT22-039 Q4893). Install those entry-state subscriptions before taking the event
  // snapshot. Effects gained later while [On Play] resolves remain excluded by
  // `onlyInitiallyArmed`, preserving the trigger-time snapshot rule (BT13-013 Q2272).
  await engine.recomputeContinuousEffects();
  const events = opts.deferWhenPlayed
    ? (["onEnterFieldAnyone"] as const)
    : (["whenPlayed", "onEnterFieldAnyone"] as const);
  await withPendingSubTriggers(
    engine,
    events,
    playedEventTrigger,
    async () => {
      // State-based rules run after the card enters and continuous effects apply, before
      // its triggered On Play effect can activate. Keep the play-event snapshot above so
      // other when-played watchers still observe the event even if a 0-DP entrant is deleted
      // here and its own On Play source becomes ineligible (EX4-074 Q3523).
      //
      // A play performed BY an effect still resolving is the exception (BT24-041 Q5629): no
      // state-based action may run between that effect's clauses, so the 0-DP entrant stays
      // on the field until the whole effect finishes and the outer sweep deletes it. This
      // mirrors the guarded `ruleProcess` seam the interpreter itself is given.
      const ruleCheckPending =
        engine.effectResolutionDepth === 0 && engine.optionResolutionDepth === 0 && hasRuleProcessPending(engine)
          ? await collectRuleProcessPending(engine)
          : [];
      await engine.fireTimingForInstance(timing, sourceInstanceId, scopedTrigger, [
        ...costDeletionEffects,
        ...ruleCheckPending,
      ]);
      await engine.fireTiming(EffectTiming.OnEnterFieldAnyone, {
        ...scopedTrigger,
        ...(entryPermanentId !== undefined ? { subjectPermanentId: entryPermanentId } : {}),
        entryCause: "play",
      });
    },
    {
      onlyInitiallyArmed: true,
      busTrigger: () => playedEventTrigger,
      // A play performed by a still-resolving effect parks the entering card's own [On Play]
      // for the enclosing window. Its `whenPlayed` watchers triggered on that same entry and
      // are simultaneous with it (CR §15-4), so they follow it there instead of resolving
      // first on the trailing bus (BT20-028 Q4321).
      parkArmedToEnclosingWindow: () => shouldDeferNestedTiming(engine),
    },
  );
}

/**
 * Producer for the `triggerEnteredByEffect` gate (BT25-084): an EFFECT just played or
 * digivolved `instanceId` into the battle area, so fire that card's OWN [On Play] /
 * [When Digivolving] window with `enteredByEffect` set to its controller's seat. This
 * is also the seam that makes an effect-played Digimon's [On Play] fire AT ALL — the
 * effect-driven play/digivolve verbs (`playInstances` / `digivolveFromInstance` /
 * `dnaDigivolveInto`) previously placed the permanent without firing its entry window.
 * A MANUAL hard play/digivolve takes the play/digivolve action's own seam (no
 * `enteredByEffect`), so the by-effect gate stays false there.
 */
export async function fireEnteredByEffectTiming(
  engine: GameEngine,
  timing: EffectTiming,
  instanceId: string,
  ownerSeat: Seat,
  opts?: {
    byEffect?: boolean;
    isDnaDigivolve?: boolean;
    digivolvedFromZone?: ZoneRef;
    baseWasDigimon?: boolean;
    previousDigivolutionLevel?: number;
    playedFromZone?: ZoneRef;
    digiXrosMaterialCount?: number;
    playedByEffectSourceCardId?: string;
    playedByDecode?: boolean;
    deferWhenPlayed?: boolean;
    procedurePending?: readonly CollectedEffect[];
  },
): Promise<void> {
  const attackerPermanentId = engine.combat?.currentAttackerId;
  const subjectPermanent = findInstance(engine, instanceId)?.permanent;
  const byEffect = opts?.byEffect !== false;
  const effectEntryTrigger = byEffect ? { enteredByEffect: ownerSeat } : {};
  if (subjectPermanent !== undefined) {
    subjectPermanent.enteredByEffect = byEffect;
  }
  if (timing === EffectTiming.OnPlay) materializePlayerCustomEffects(engine, subjectPermanent);
  // Effect-driven digivolutions are genuine digivolutions for "digivolved engine turn"
  // conditions (BT1-007 Q871). As with the manual action seam, breeding-area evolutions
  // remain excluded unless card text explicitly references that area (Q870).
  if (timing === EffectTiming.WhenDigivolving && subjectPermanent !== undefined && !subjectPermanent.inBreeding) {
    engine.tracker.register(`seat:${ownerSeat}`, "digivolvedThisTurn");
  }
  if (timing === EffectTiming.OnPlay) {
    await firePlayEntryWindows(
      engine,
      timing,
      instanceId,
      {
        ...effectEntryTrigger,
        ...(attackerPermanentId !== undefined ? { attackerPermanentId } : {}),
        ...(opts?.playedFromZone !== undefined ? { playedFromZone: opts.playedFromZone } : {}),
        ...(opts?.digiXrosMaterialCount !== undefined ? { digiXrosMaterialCount: opts.digiXrosMaterialCount } : {}),
        ...(opts?.playedByEffectSourceCardId !== undefined
          ? { playedByEffectSourceCardId: opts.playedByEffectSourceCardId }
          : {}),
        ...(opts?.playedByDecode === true ? { playedByDecode: true } : {}),
      },
      opts,
    );
    return;
  }
  const scopedTrigger: TriggerInfo = {
    ...effectEntryTrigger,
    ...(attackerPermanentId !== undefined ? { attackerPermanentId } : {}),
    ...(opts?.isDnaDigivolve === true ? { isDnaDigivolve: true } : {}),
    ...(opts?.digivolvedFromZone !== undefined ? { digivolvedFromZone: opts.digivolvedFromZone } : {}),
    ...(opts?.playedFromZone !== undefined ? { playedFromZone: opts.playedFromZone } : {}),
    ...(opts?.digiXrosMaterialCount !== undefined ? { digiXrosMaterialCount: opts.digiXrosMaterialCount } : {}),
    ...(opts?.playedByEffectSourceCardId !== undefined
      ? { playedByEffectSourceCardId: opts.playedByEffectSourceCardId }
      : {}),
  };
  const subjectPermanentId = subjectPermanent?.permanentId;
  if (timing !== EffectTiming.WhenDigivolving || subjectPermanent === undefined || subjectPermanentId === undefined) {
    await engine.fireTimingForInstance(timing, instanceId, scopedTrigger);
    return;
  }
  const enterFieldTrigger = {
    subjectPermanentId,
    entryCause: "digivolve" as const,
    ...effectEntryTrigger,
    ...(opts?.isDnaDigivolve === true ? { isDnaDigivolve: true } : {}),
  };
  // Q6671/Q6708: a Tamer base digivolves as a Tamer, so the payload is tagged and the
  // SubTrigger gate withholds plain "when a Digimon digivolves" watchers while Tamer-naming
  // watchers still fire. The caller's report reads EFFECTIVE kinds, so a Tamer treated as a
  // Digimon is not tagged; callers that report nothing (App Fusion) fall back to the printed
  // base. The entering card's own [When Digivolving] window, and the bonus draw (Q6709),
  // are unaffected.
  const fromTamer = digivolvedFromTamerBase(subjectPermanent);
  const tamerDigivolved = fromTamer && opts?.baseWasDigimon !== true;
  const watcherTrigger = {
    subjectPermanentId,
    digivolvedInstanceId: instanceId,
    ...(subjectPermanent === undefined ? {} : { digivolvedSubject: subjectPermanent.clone() }),
    ...effectEntryTrigger,
    ...(opts?.previousDigivolutionLevel === undefined
      ? {}
      : { previousDigivolutionLevel: opts.previousDigivolutionLevel }),
    ...(opts?.isDnaDigivolve === true ? { isDnaDigivolve: true } : {}),
    ...(opts?.digivolvedFromZone !== undefined ? { digivolvedFromZone: opts.digivolvedFromZone } : {}),
    ...(fromTamer ? { digivolvedFromTamer: true } : {}),
    ...(tamerDigivolved ? { tamerDigivolved: true } : {}),
  };
  const fireEntryWindows = async (): Promise<void> => {
    await engine.fireTimingForInstance(timing, instanceId, scopedTrigger);
    await engine.fireTiming(EffectTiming.OnEnterFieldAnyone, enterFieldTrigger);
    await engine.fireSubTrigger("onEnterFieldAnyone", enterFieldTrigger);
  };
  const watcherEvents = ["whenOneOfYoursDigivolves", "whenAnyDigivolves"] as const;
  if (shouldDeferNestedTiming(engine)) {
    await fireEntryWindows();
    for (const event of watcherEvents) await engine.fireSubTrigger(event, watcherTrigger);
    return;
  }
  await engine.recomputeContinuousEffects();
  await withPendingSubTriggers(engine, watcherEvents, watcherTrigger, fireEntryWindows, {
    onlyInitiallyArmed: !engine.ruleProcessing,
  });
}

/** Materialize filtered player-scoped named grants before a new permanent's On Play window. */
export function materializePlayerCustomEffects(engine: GameEngine, permanent: Permanent | undefined): void {
  const top = permanent?.topCard;
  if (permanent === undefined || top === undefined) return;
  const permanentId = permanent.permanentId;
  for (const grant of engine.continuous.playerCustomEffectsOf(permanent.controllerSeat)) {
    engine.continuous.addCustomEffectGrant(top.instanceId, top.ownerSeat, grant.token, grant.duration, {
      activationIdentity: grant.activationIdentity,
      isActive: () => grant.matches(permanentId),
    });
  }
}

/** The `whenPlayed` payload for a played permanent: its subject id plus its printed level/cost. */
export function playedTrigger(engine: GameEngine, playedPermanentId: string | undefined): TriggerInfo | undefined {
  if (playedPermanentId === undefined) return undefined;
  const played = engine.access.permanentById(playedPermanentId);
  const definition = played?.topCard === undefined ? undefined : definitionOf(played.topCard.cardId);
  return {
    subjectPermanentId: playedPermanentId,
    ...(played === undefined ? {} : { playedSubject: played.clone() }),
    ...(definition?.level !== undefined ? { playedLevel: definition.level } : {}),
    ...(definition?.playCost !== undefined ? { playedPlayCost: definition.playCost } : {}),
  };
}

/**
 * Re-activate one (or, with `chooseOne: false`, ALL) of a TARGET permanent's own effects at
 * the given timing(s) — generalized from EX3-065's original "activate 1 of that Digimon's
 * [On Play] effects" (`timings` defaults to `[OnPlay]`, matching EX3-065 exactly) to also
 * cover BT11-112 ("[When Digivolving] effects"), BT24-102 ("[On Play] or [When Digivolving]
 * effect" — a combined pool across both timings), BT22-092 ("[Main] effects", i.e.
 * `EffectTiming.OnDeclaration`), and BT15-041 ("activate the [When Digivolving] effects" —
 * plural: `chooseOne: false` runs every matching effect instead of picking one).
 *
 * A genuine re-fire of another card's timing effect (not a proxy): each chosen effect
 * resolves with the TARGET permanent's top card as source, so its actions belong to that
 * Digimon and its controller. Collects the target's non-security effects across every listed
 * timing; with 2+ candidates and `chooseOne`, asks the target's controller to pick exactly
 * one (KB Q3430/Q3431 for the OnPlay case).
 *
 * Returns whether an effect actually resolved (false when there were no eligible candidates,
 * or the chosen one's `canActivate` failed) — BT22-092's "if engine activated any effect, gain
 * 1 memory" reads engine result rather than assuming success.
 */
export async function reactivateOnPlay(
  engine: GameEngine,
  permanentId: string,
  opts?: {
    timings?: EffectTiming[];
    chooseOne?: boolean;
    outsideTriggerWindow?: boolean;
    continueEffectAfterAttackDeclaration?: () => Promise<void>;
  },
): Promise<boolean> {
  const permanent = engine.access.permanentById(permanentId);
  if (permanent?.topCard === undefined) return false;
  const timings = opts?.timings ?? [EffectTiming.OnPlay];
  const chooseOne = opts?.chooseOne ?? true;
  // Both gates, matching every other manual-resolution path (e.g. syncActivatableEffects,
  // fireBeforePayCost): canTrigger encodes the effect's declared `when` condition, which
  // canActivate alone does not — an effect whose trigger condition no longer holds must not
  // be offered/resolved even if its (often unconditional) canActivate would pass.
  const instances = [permanent.topCard, ...permanent.stack];
  const mainCandidates = timings.includes(EffectTiming.OnDeclaration)
    ? engine.projection.activatableEffectsFor(instances).map((collected) => ({
        effect: collected.effect,
        source: collected.source,
        ctx: { ...engine.projection.activationContext(collected), selections: new Map() },
        timing: undefined,
      }))
    : [];
  // Main activation must use the same gained/inherited effect identities as the public intent.
  // Raw buried printed effects have no placement permission and silently fail after selection.
  const candidates = [
    ...mainCandidates,
    ...instances.flatMap((instance) => {
      const source = cardSourceOf(engine, instance);
      const ctx: EffectContext = { ...buildEffectContext(engine, source, {}), selections: new Map() };
      return timings
        .filter((timing) => timing !== EffectTiming.OnDeclaration)
        .flatMap((timing) => {
          const timingKey: "whenDigivolving" | "onPlay" | "whenAttacking" | undefined =
            timing === EffectTiming.WhenDigivolving
              ? "whenDigivolving"
              : timing === EffectTiming.OnPlay
                ? "onPlay"
                : timing === EffectTiming.OnUseAttack
                  ? "whenAttacking"
                  : undefined;
          return effectsOf(timing, source).map((effect) => ({ effect, source, ctx, timing: timingKey }));
        });
    }),
  ]
    .filter(({ effect }) => !effect.isSecurity)
    .filter(({ effect, ctx }) => opts?.outsideTriggerWindow === true || canTrigger(effect, ctx, engine.tracker));
  const availableCandidates = candidates.filter(({ effect, ctx, timing }) => {
    if (opts?.outsideTriggerWindow === true && !canActivate(effect, ctx, engine.tracker)) {
      return false;
    }
    if (timing === undefined) return true;
    const sourcePermanentId = ctx.source.permanent()?.permanentId;
    return sourcePermanentId === undefined || !isTimingActivationDisabled(engine.continuous, sourcePermanentId, timing);
  });
  if (availableCandidates.length === 0) return false;
  if (!chooseOne) {
    let activatedAny = false;
    for (const { effect, ctx, timing } of availableCandidates) {
      if (!canActivate(effect, ctx, engine.tracker)) continue;
      const sourcePermanentId = ctx.source.permanent()?.permanentId;
      if (
        timing !== undefined &&
        sourcePermanentId !== undefined &&
        isTimingActivationDisabled(engine.continuous, sourcePermanentId, timing)
      )
        continue;
      await resolveReactivatedEffect({ effect, ctx });
      activatedAny = true;
    }
    await engine.recomputeContinuousEffects();
    return activatedAny;
  }
  let chosen = availableCandidates[0]!;
  if (availableCandidates.length > 1) {
    const index = await engine.decisionApi.chooseOption(
      chosen.ctx,
      availableCandidates.map(({ effect }) => effect.description),
    );
    chosen = availableCandidates[index] ?? availableCandidates[0]!;
  }
  if (!canActivate(chosen.effect, chosen.ctx, engine.tracker)) return false;
  const chosenSourcePermanentId = chosen.ctx.source.permanent()?.permanentId;
  if (
    chosen.timing !== undefined &&
    chosenSourcePermanentId !== undefined &&
    isTimingActivationDisabled(engine.continuous, chosenSourcePermanentId, chosen.timing)
  )
    return false;
  if (opts?.continueEffectAfterAttackDeclaration !== undefined)
    chosen.ctx.continueEffectAfterAttackDeclaration = opts.continueEffectAfterAttackDeclaration;
  // KB Q4963: an effect activated by another effect still spends its [Once Per Turn].
  engine.tracker.register(chosen.source.instanceId, chosen.effect.effectKey);
  await resolveReactivatedEffect({ effect: chosen.effect, ctx: chosen.ctx });
  await engine.recomputeContinuousEffects();
  return true;
}

type ResolveReactivatedEffectParams = {
  effect: CollectedEffect["effect"];
  ctx: EffectContext;
};

async function resolveReactivatedEffect({ effect, ctx }: ResolveReactivatedEffectParams): Promise<void> {
  const outerSourceKinds = ctx.effectSourceKinds;
  const sourceKinds = effectProvenanceKinds(ctx, { isLinked: effect.isLinked });
  ctx.effectSourceKinds = sourceKinds;
  ctx.fx.enterEffectResolution?.(
    ctx.source.ownerSeat,
    sourceKinds,
    ctx.conferredToPermanentId ?? ctx.source.permanent()?.permanentId,
  );
  try {
    await effect.resolve(ctx);
  } finally {
    ctx.fx.leaveEffectResolution?.();
    ctx.effectSourceKinds = outerSourceKinds;
  }
}
